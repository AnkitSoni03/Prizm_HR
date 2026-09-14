import { useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarClock, CalendarRange } from 'lucide-react';
import { RequestCard, RequestCardGrid, RequestCardRow } from '../../components/ui/RequestCard';
import { ManagerApprovalStatus } from '../../components/ManagerApprovalStatus';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import {
  cancelLeaveRequest,
  createLeaveRequest,
  listLeaveTypes,
  listMyLeaveRequests,
  type LeaveRequest,
  type LeaveType,
} from '../../api/ess/leave';
import { getMyProfile } from '../../api/ess/profile';
import { formatDisplayDate } from '../../utils/dateDisplay';
import { WEEKDAY_LABELS } from '../../utils/weekdays';

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
  const { user } = useAuth();
  const confirm = useConfirm();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [weekOffLeaveBlockedDays, setWeekOffLeaveBlockedDays] = useState<number[]>([]);
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
  const [dateWarning, setDateWarning] = useState<string | null>(null);

  useEffect(() => {
    listLeaveTypes({ rosterGroupId: user?.rosterGroupId ?? 'none' })
      .then(setLeaveTypes)
      .catch(() => setError('Could not load leave types.'));
  }, [user?.rosterGroupId]);

  useEffect(() => {
    if (!user?.employeeId) return;
    getMyProfile(user.employeeId)
      .then((profile) => setWeekOffLeaveBlockedDays(profile.weekOffLeaveBlockedDays ?? []))
      .catch(() => {
        /* non-critical — worst case the calendar just doesn't pre-block a day, server still enforces it */
      });
  }, [user?.employeeId]);

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
    setDateWarning(null);
    setIsModalOpen(true);
  }

  const selectedLeaveType = leaveTypes.find((t) => t.id === leaveTypeId);
  // Week Off Leave is single-day only (leaveRequest.service.js::createLeaveRequest
  // rejects a multi-day request for this type — needed so an auto-reversal,
  // when the employee turns out to be present that day, has exactly one
  // day's balance/status to cleanly undo). "To" is locked to "From" here as
  // soon as this type is selected, rather than letting the employee pick a
  // range and only finding out via a 400 on submit.
  const isWeekOffLeaveType = !!selectedLeaveType?.isWeekOffBucket;
  // Admin-assigned restriction only applies to the Week Off Leave bucket —
  // every other leave type is unaffected. The date inputs below are native
  // <input type="date">, which can't grey out individual weekdays, so a
  // blocked day is instead rejected right when picked (reverted + a message)
  // and the range is re-checked before submit as a backstop (the backend
  // enforces this regardless — see leaveRequest.service.js::createLeaveRequest).
  const isWeekOffLeaveSelected = isWeekOffLeaveType && weekOffLeaveBlockedDays.length > 0;

  function isDateBlocked(dateStr: string): boolean {
    if (!isWeekOffLeaveSelected) return false;
    return weekOffLeaveBlockedDays.includes(new Date(`${dateStr}T00:00:00`).getDay());
  }

  function rangeHasBlockedDay(from: string, to: string): boolean {
    if (!isWeekOffLeaveSelected) return false;
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (weekOffLeaveBlockedDays.includes(d.getDay())) return true;
    }
    return false;
  }

  const blockedDayLabels = weekOffLeaveBlockedDays.map((d) => WEEKDAY_LABELS[d]).join(', ');
  const rangeBlocked = rangeHasBlockedDay(fromDate, toDate);

  async function handleSubmit() {
    if (!leaveTypeId || rangeBlocked) return;
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
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:mb-3 sm:gap-3">
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
        <Button
          onClick={openModal}
          disabled={leaveTypes.length === 0}
          className="!px-3 !py-1.5 !text-xs sm:!px-4 sm:!py-2 sm:!text-sm"
        >
          Apply for leave
        </Button>
      </div>

      {error && <p className="mb-2.5 text-xs text-danger sm:mb-3 sm:text-sm">{error}</p>}
      {!error && leaveTypes.length === 0 && (
        <p className="mb-2.5 text-xs text-ink-muted sm:mb-3 sm:text-sm">
          No leave types are available to you yet — this shows up once a Roster with a Leave Policy is assigned to
          you. Contact HR if you think this is a mistake.
        </p>
      )}

      <RequestCardGrid
        isLoading={isLoading}
        items={requests}
        rowKey={(r) => r.id}
        emptyMessage="You haven't applied for any leave yet."
        renderCard={(r) => (
          <RequestCard
            icon={CalendarClock}
            title={r.leaveType?.name ?? 'Leave'}
            status={<Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>}
            footer={
              r.status === 'pending' ? (
                <button
                  type="button"
                  onClick={() => handleCancel(r.id)}
                  className="text-xs font-medium text-danger hover:underline"
                >
                  Cancel request
                </button>
              ) : undefined
            }
          >
            <div className="flex items-center gap-1.5 text-sm text-ink">
              <CalendarRange className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
              {formatDisplayDate(r.fromDate)} → {formatDisplayDate(r.toDate)}
            </div>
            <RequestCardRow label="Days" value={r.days} />
            {r.reason && <RequestCardRow label="Reason" value={<span className="line-clamp-2">{r.reason}</span>} />}
            {r.status !== 'cancelled' && (
              <div className="border-t border-border pt-2">
                <ManagerApprovalStatus approvals={r.managerApprovals} decisionMode={r.decisionMode} variant="list" />
              </div>
            )}
          </RequestCard>
        )}
      />
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {isModalOpen && (
        <Modal title="Apply for leave" onClose={() => setIsModalOpen(false)}>
          <div className="space-y-4">
            <Select
              id="apply-leave-type"
              label="Leave Type"
              value={leaveTypeId}
              onChange={(event) => {
                const value = event.target.value;
                setLeaveTypeId(value);
                setDateWarning(null);
                // Force single-day the moment Week Off Leave is picked —
                // matches the server-side constraint, and avoids the
                // employee filling in a range only to hit a 400 on submit.
                if (leaveTypes.find((t) => t.id === value)?.isWeekOffBucket) setToDate(fromDate);
              }}
              options={leaveTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
            {isWeekOffLeaveSelected && (
              <p className="-mt-2 text-xs text-ink-muted">
                You can't take Week Off Leave on: {blockedDayLabels}.
              </p>
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  id="apply-leave-from"
                  type="date"
                  label="From"
                  value={fromDate}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (isDateBlocked(value)) {
                      setDateWarning(
                        `${WEEKDAY_LABELS[new Date(`${value}T00:00:00`).getDay()]} is blocked for Week Off Leave — pick another day.`
                      );
                      return;
                    }
                    setDateWarning(null);
                    setFromDate(value);
                    // Week Off Leave is single-day — "To" always tracks
                    // "From" for this type. Otherwise, just keep "To" from
                    // silently holding a now-invalid date before the newly
                    // picked "From".
                    if (isWeekOffLeaveType || toDate < value) setToDate(value);
                  }}
                />
              </div>
              <div className="flex-1">
                <Input
                  id="apply-leave-to"
                  type="date"
                  label="To"
                  value={toDate}
                  min={fromDate}
                  disabled={isWeekOffLeaveType}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (isDateBlocked(value)) {
                      setDateWarning(
                        `${WEEKDAY_LABELS[new Date(`${value}T00:00:00`).getDay()]} is blocked for Week Off Leave — pick another day.`
                      );
                      return;
                    }
                    setDateWarning(null);
                    setToDate(value);
                  }}
                />
              </div>
            </div>
            {dateWarning && <p className="text-xs text-danger">{dateWarning}</p>}
            {!dateWarning && rangeBlocked && (
              <p className="text-xs text-danger">
                This range includes a day you can't take Week Off Leave on — pick a narrower range.
              </p>
            )}
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
              <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!leaveTypeId || rangeBlocked}>
                Submit request
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
