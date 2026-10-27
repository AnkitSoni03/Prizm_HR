import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Table } from '../../../components/ui/Table';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../context/toast-context';
import { apiErrorMessage } from '../../../utils/apiError';
import {
  LEVEL_LABEL,
  cancelReleaseRequests,
  decideReleaseRequests,
  formatRupees,
  listReleaseRequests,
  orgLabel,
  type PayrollAccess,
  type ReleaseRequest,
  type ReleaseStatus,
} from '../../../api/payroll';

const LIMIT = 50;
type Direction = 'incoming' | 'outgoing';

const STATUS_TONE: Record<ReleaseStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};
const STATUS_LABEL: Record<ReleaseStatus, string> = { pending: 'Waiting', approved: 'Released', rejected: 'Rejected', cancelled: 'Cancelled' };

const requesterLabel = (r: ReleaseRequest) =>
  r.toBrand ? `${r.toCompany?.name ?? 'Company'} › ${r.toBrand.name}` : r.toCompany?.name ?? 'Company';

// Salary release requests. "Waiting for you": a lower level asked for
// employees whose salary your level (or one below it) assigned — approve
// hands the current salary down to them, reject keeps it with you.
// "Sent by you": your own requests to the level above.
export function ReleasesTab({ access, onChanged }: { access: PayrollAccess; onChanged?: () => void }) {
  const showToast = useToast();
  // A Brand level never owns salaries above anyone — its requests are the
  // ones it sends.
  const [direction, setDirection] = useState<Direction>(access.level === 'brand' ? 'outgoing' : 'incoming');
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<ReleaseRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const r = await listReleaseRequests({ direction, status, limit: LIMIT, offset });
      setRows(r.data);
      setTotal(r.pagination.total);
      setChecked(new Set());
    } catch {
      setError('Could not load release requests.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(load, 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, status, offset]);

  const actionable = rows.filter((r) => (direction === 'incoming' ? r.canDecide : r.status === 'pending'));
  const allChecked = actionable.length > 0 && actionable.every((r) => checked.has(String(r.id)));
  const ids = [...checked];

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
  }

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    try {
      showToast(await fn(), 'success');
      onChanged?.();
      load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Something went wrong.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const approve = (list: string[]) =>
    run(async () => {
      const r = await decideReleaseRequests(list, true);
      return `Released ${r.decided} employee${r.decided === 1 ? '' : 's'}.`;
    });
  const cancel = (list: string[]) =>
    run(async () => {
      const r = await cancelReleaseRequests(list);
      return `Cancelled ${r.cancelled} request${r.cancelled === 1 ? '' : 's'}.`;
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        An employee’s salary belongs to the level that assigned it. A lower level that wants to put them on its own template asks
        for a release; approving hands the current salary down (it keeps running) so they can assign their own.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {access.level !== 'group' && (
          <div className="w-48">
            <Select
              label="Requests"
              value={direction}
              onChange={(e) => {
                setOffset(0);
                setDirection(e.target.value as Direction);
              }}
              options={[
                { value: 'incoming', label: 'Waiting for you' },
                { value: 'outgoing', label: 'Sent by you' },
              ]}
            />
          </div>
        )}
        <div className="w-44">
          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              setOffset(0);
              setStatus(e.target.value);
            }}
            options={[
              { value: 'pending', label: 'Waiting' },
              { value: 'approved', label: 'Released' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
      </div>

      {checked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-page px-3 py-2 text-sm">
          <span className="text-ink-muted">{checked.size} selected</span>
          {direction === 'incoming' ? (
            <>
              <Button isLoading={busy} onClick={() => approve(ids)}>
                Approve release
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => setRejecting(ids)}>
                Reject
              </Button>
            </>
          ) : (
            <Button variant="secondary" isLoading={busy} onClick={() => cancel(ids)}>
              Cancel request
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <Table
        isLoading={isLoading}
        rows={rows}
        rowKey={(r) => String(r.id)}
        emptyMessage={direction === 'incoming' ? 'No release requests for you.' : 'You haven’t requested any releases.'}
        columns={[
          {
            key: 'pick',
            header: '',
            render: (r) =>
              actionable.includes(r) ? (
                <input
                  type="checkbox"
                  aria-label={`Select ${r.employee?.name ?? 'employee'}`}
                  checked={checked.has(String(r.id))}
                  onChange={() => toggle(String(r.id))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                />
              ) : null,
          },
          {
            key: 'employee',
            header: 'Employee',
            render: (r) => (
              <div>
                <p className="font-medium text-ink">
                  {r.employee?.name ?? '—'} {r.employee?.employeeCode ? `(${r.employee.employeeCode})` : ''}
                </p>
                <p className="text-xs text-ink-muted">{orgLabel(r.employee)}</p>
              </div>
            ),
          },
          {
            key: 'salary',
            header: 'Current salary',
            render: (r) =>
              r.assignment ? (
                <div>
                  <p className="text-ink">{r.assignment.template?.name ?? '—'}</p>
                  <p className="text-xs text-ink-muted">{formatRupees(r.assignment.monthlyGross)} / month</p>
                </div>
              ) : (
                '—'
              ),
          },
          {
            key: 'from',
            header: direction === 'incoming' ? 'Requested by' : 'Asked',
            render: (r) =>
              direction === 'incoming' ? (
                <div>
                  <p className="text-ink">{requesterLabel(r)}</p>
                  <p className="text-xs text-ink-muted">{r.requestedBy?.email ?? ''}</p>
                </div>
              ) : (
                <Badge tone="neutral">{LEVEL_LABEL[r.ownerLevel]}</Badge>
              ),
          },
          {
            key: 'reason',
            header: 'Reason',
            render: (r) => (
              <div className="max-w-xs text-sm">
                <p className="text-ink">{r.reason || '—'}</p>
                {r.decisionNote && <p className="text-xs text-ink-muted">Reply: {r.decisionNote}</p>}
              </div>
            ),
          },
          { key: 'date', header: 'Date', render: (r) => new Date(r.createdAt).toLocaleDateString() },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
          },
          {
            key: 'actions',
            header: '',
            className: 'w-20 text-right',
            render: (r) =>
              direction === 'incoming' && r.canDecide ? (
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    title="Approve release"
                    disabled={busy}
                    className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-success"
                    onClick={() => approve([String(r.id)])}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Reject"
                    disabled={busy}
                    className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-danger"
                    onClick={() => setRejecting([String(r.id)])}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : direction === 'outgoing' && r.status === 'pending' ? (
                <button type="button" className="text-xs font-medium text-ink-muted hover:underline" onClick={() => cancel([String(r.id)])}>
                  Cancel
                </button>
              ) : null,
          },
        ]}
      />
      {actionable.length > 0 && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() => setChecked(allChecked ? new Set() : new Set(actionable.map((r) => String(r.id))))}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
          />
          Select all on this page
        </label>
      )}
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {rejecting && (
        <RejectModal
          count={rejecting.length}
          onClose={() => setRejecting(null)}
          onReject={(note) =>
            run(async () => {
              const r = await decideReleaseRequests(rejecting, false, note);
              setRejecting(null);
              return `Rejected ${r.decided} request${r.decided === 1 ? '' : 's'}.`;
            })
          }
        />
      )}
    </div>
  );
}

function RejectModal({ count, onClose, onReject }: { count: number; onClose: () => void; onReject: (note: string) => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Reject ${count} request${count === 1 ? '' : 's'}`} onClose={onClose} compact>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">The employees stay on their current salary, managed by you. The requester is told why.</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Reason"
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!note.trim()) return setError('Give a reason.');
              onReject(note.trim());
            }}
          >
            Reject
          </Button>
        </div>
      </div>
    </Modal>
  );
}
