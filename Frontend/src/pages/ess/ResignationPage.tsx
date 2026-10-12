import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from '../../components/ui/Tabs';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { RequestCardGrid } from '../../components/ui/RequestCard';
import { ResignationCard } from '../../components/ResignationCard';
import { DecideResignationModal } from '../../components/DecideResignationModal';
import { useConfirm } from '../../context/confirm-context';
import { useAuth } from '../../context/auth-context';
import { apiErrorMessage } from '../../utils/apiError';
import { formatEmployeeLabel } from '../../utils/employeeDisplay';
import {
  listMyResignations,
  listTeamResignations,
  submitResignation,
  withdrawResignation,
  type Resignation,
} from '../../api/resignations';

const LIMIT = 20;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ESS Resignation: "My Resignation" (submit / withdraw / history) and
// "Team" (resignations of employees I'm the assigned HR for — Accept/Reject
// — or a manager of — view only).
export function ResignationPage() {
  const [searchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const canSubmit = hasPermission('resignation:submit_own');
  const canSeeTeam = hasPermission('resignation:decide_assigned') || hasPermission('resignation:read_reports');
  const [tab, setTab] = useState(searchParams.get('tab') === 'team' && canSeeTeam ? 'team' : 'mine');

  const tabs = [{ key: 'mine', label: 'My Resignation' }];
  if (canSeeTeam) tabs.push({ key: 'team', label: 'Team Resignations' });

  return (
    <div>
      {tabs.length > 1 && <Tabs items={tabs} active={tab} onChange={setTab} />}
      {tab === 'mine' ? <MyResignations canSubmit={canSubmit} /> : <TeamResignations />}
    </div>
  );
}

function MyResignations({ canSubmit }: { canSubmit: boolean }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Resignation[]>([]);
  const [hrName, setHrName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [lastWorkingDate, setLastWorkingDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listMyResignations();
      setRows(result.data);
      setHrName(result.hr ? formatEmployeeLabel(result.hr) : null);
    } catch {
      setError('Could not load your resignations.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const hasPending = rows.some((r) => r.status === 'pending');

  function openModal() {
    setReason('');
    setLastWorkingDate('');
    setSubmitError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    if (!reason.trim()) return;
    const confirmed = await confirm({
      title: 'Submit resignation',
      message:
        'Your managers, your HR and your company admins will be notified on their dashboard and by email. Continue?',
      confirmLabel: 'Submit',
      variant: 'danger',
    });
    if (!confirmed) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitResignation({ reason: reason.trim(), lastWorkingDate: lastWorkingDate || undefined });
      setIsModalOpen(false);
      load();
    } catch (err) {
      setSubmitError(apiErrorMessage(err, 'Could not submit your resignation. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleWithdraw(id: string) {
    const confirmed = await confirm({
      title: 'Withdraw resignation',
      message: 'Withdraw your resignation? Everyone who was notified will be told.',
      confirmLabel: 'Withdraw',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await withdrawResignation(id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not withdraw your resignation.'));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Your HR: <span className="font-medium text-ink">{hrName ?? 'Not assigned yet'}</span>
        </p>
        {canSubmit && !hasPending && (
          <Button variant="danger" onClick={openModal} className="!px-3 !py-1.5 !text-xs sm:!px-4 sm:!py-2 sm:!text-sm">
            Submit resignation
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <RequestCardGrid
        isLoading={isLoading}
        items={rows}
        rowKey={(r) => r.id}
        emptyMessage="You haven't submitted a resignation."
        renderCard={(r) => (
          <ResignationCard
            resignation={r}
            footer={
              r.status === 'pending' ? (
                <button
                  type="button"
                  onClick={() => handleWithdraw(r.id)}
                  className="text-xs font-medium text-danger hover:underline"
                >
                  Withdraw
                </button>
              ) : undefined
            }
          />
        )}
      />

      {isModalOpen && (
        <Modal title="Submit resignation" onClose={() => setIsModalOpen(false)} widthClassName="max-w-md">
          <div className="space-y-4">
            {!hrName && (
              <p className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
                No HR is assigned to you yet. You can still submit; it will be decided once HR is assigned.
              </p>
            )}
            <div>
              <label htmlFor="resignation-reason" className="mb-1.5 block text-sm font-medium text-ink">
                Reason
              </label>
              <textarea
                id="resignation-reason"
                rows={5}
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Write your resignation message"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
              />
            </div>
            <Input
              id="resignation-lwd"
              type="date"
              label="Preferred last working day (optional)"
              min={todayString()}
              value={lastWorkingDate}
              onChange={(event) => setLastWorkingDate(event.target.value)}
            />
            {submitError && <p className="text-sm text-danger">{submitError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleSubmit} isLoading={isSubmitting} disabled={!reason.trim()}>
                Submit
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TeamResignations() {
  const [rows, setRows] = useState<Resignation[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ resignation: Resignation; action: 'accept' | 'reject' } | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listTeamResignations({ status: statusFilter || undefined, limit: LIMIT, offset });
      setRows(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load team resignations.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, offset]);

  return (
    <div>
      <div className="mb-3 w-full sm:w-48">
        <Select
          id="team-resignation-status"
          label="Status"
          value={statusFilter}
          onChange={(event) => {
            setOffset(0);
            setStatusFilter(event.target.value);
          }}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
        />
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        Only the employee's assigned HR can accept or reject. Managers can view.
      </p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <RequestCardGrid
        isLoading={isLoading}
        items={rows}
        rowKey={(r) => r.id}
        emptyMessage="No resignations here."
        renderCard={(r) => (
          <ResignationCard
            resignation={r}
            showEmployee
            footer={
              r.canDecide ? (
                <div className="flex gap-2">
                  <Button
                    onClick={() => setDeciding({ resignation: r, action: 'accept' })}
                    className="!px-3 !py-1.5 !text-xs"
                  >
                    Accept
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setDeciding({ resignation: r, action: 'reject' })}
                    className="!px-3 !py-1.5 !text-xs"
                  >
                    Reject
                  </Button>
                </div>
              ) : r.status === 'pending' ? (
                <span className="text-xs text-ink-muted">
                  {r.isAssignedHr ? '' : 'Waiting for HR decision'}
                </span>
              ) : undefined
            }
          />
        )}
      />
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {deciding && (
        <DecideResignationModal
          resignation={deciding.resignation}
          action={deciding.action}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            load();
          }}
        />
      )}
    </div>
  );
}
