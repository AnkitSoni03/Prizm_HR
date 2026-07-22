import { useEffect, useState } from 'react';
import axios from 'axios';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { useConfirm } from '../../context/confirm-context';
import {
  cancelLeaveRequest,
  createLeaveRequest,
  listLeaveTypes,
  listMyLeaveRequests,
  type LeaveRequest,
  type LeaveType,
} from '../../api/ess/leave';
import { formatDisplayDate } from '../../utils/dateDisplay';

const LIMIT = 20;

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function MyLeavePage() {
  const confirm = useConfirm();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState(formatDate(new Date()));
  const [toDate, setToDate] = useState(formatDate(new Date()));
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    listLeaveTypes()
      .then(setLeaveTypes)
      .catch(() => setError('Could not load leave types.'));
  }, []);

  async function loadRequests() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listMyLeaveRequests({ status: statusFilter || undefined, limit: LIMIT, offset });
      setRequests(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load your leave requests.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, offset]);

  function openModal() {
    setLeaveTypeId(leaveTypes[0]?.id ?? '');
    setFromDate(formatDate(new Date()));
    setToDate(formatDate(new Date()));
    setReason('');
    setSubmitError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    if (!leaveTypeId) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await createLeaveRequest({ leaveTypeId, fromDate, toDate, reason: reason.trim() || undefined });
      setIsModalOpen(false);
      setOffset(0);
      loadRequests();
    } catch (err) {
      setSubmitError(extractError(err, 'Could not submit your leave request. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    const confirmed = await confirm({
      title: 'Cancel leave request',
      message: 'Cancel this leave request?',
      confirmLabel: 'Cancel Request',
      variant: 'danger',
    });
    if (!confirmed) return;
    await cancelLeaveRequest(id);
    loadRequests();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-48">
          <Select
            id="leave-status-filter"
            label="Status"
            value={statusFilter}
            onChange={(event) => {
              setOffset(0);
              setStatusFilter(event.target.value);
            }}
            placeholder="All statuses"
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>
        <Button onClick={openModal}>Apply for leave</Button>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <Table
        isLoading={isLoading}
        rows={requests}
        rowKey={(r) => r.id}
        emptyMessage="You haven't applied for any leave yet."
        columns={[
          { key: 'type', header: 'Type', render: (r) => r.leaveType?.name ?? '—' },
          {
            key: 'dates',
            header: 'Dates',
            render: (r) => `${formatDisplayDate(r.fromDate)} → ${formatDisplayDate(r.toDate)}`,
          },
          { key: 'days', header: 'Days', render: (r) => r.days },
          { key: 'reason', header: 'Reason', render: (r) => r.reason ?? '—' },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>,
          },
          {
            key: 'actions',
            header: '',
            className: 'w-28 text-right',
            render: (r) =>
              r.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => handleCancel(r.id)}
                  className="text-xs font-medium text-danger hover:underline"
                >
                  Cancel
                </button>
              ),
          },
        ]}
      />
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {isModalOpen && (
        <Modal title="Apply for leave" onClose={() => setIsModalOpen(false)}>
          <div className="space-y-4">
            <Select
              id="apply-leave-type"
              label="Leave Type"
              value={leaveTypeId}
              onChange={(event) => setLeaveTypeId(event.target.value)}
              options={leaveTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  id="apply-leave-from"
                  type="date"
                  label="From"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Input
                  id="apply-leave-to"
                  type="date"
                  label="To"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </div>
            </div>
            <div>
              <label htmlFor="apply-leave-reason" className="mb-1.5 block text-sm font-medium text-ink">
                Reason (optional)
              </label>
              <textarea
                id="apply-leave-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {submitError && <p className="text-sm text-danger">{submitError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!leaveTypeId}>
                Submit request
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
