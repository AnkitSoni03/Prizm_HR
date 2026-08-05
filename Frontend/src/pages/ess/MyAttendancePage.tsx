import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import {
  createRegularization,
  listMyAttendance,
  listMyRegularizations,
  type Attendance,
  type AttendanceRegularization,
} from '../../api/ess/attendance';
import { getMyProfile } from '../../api/ess/profile';
import { formatDisplayDate } from '../../utils/dateDisplay';

type Tab = 'history' | 'requests';

const LIMIT = 20;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  present: 'success',
  on_duty: 'success',
  half_day: 'warning',
  absent: 'danger',
  leave: 'neutral',
  holiday: 'neutral',
  weekoff: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'half_day', label: 'Half Day' },
  { value: 'on_duty', label: 'On Duty' },
  { value: 'absent', label: 'Absent' },
];

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// First/last calendar day of the selected "YYYY-MM" month, clipped to
// today if the month hasn't finished yet.
function monthRange(month: string): { from: string; to: string } {
  const [year, mon] = month.split('-').map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const to = formatDate(new Date(year, mon - 1, lastDay));
  const today = formatDate(new Date());
  return { from, to: to > today ? today : to };
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Working hours for a single day — only meaningful once both punches exist
// (an open check-in with no check-out yet, or a leave/holiday/weekoff day
// with neither, both correctly contribute 0).
function workedMinutes(record: Attendance): number {
  if (!record.checkIn || !record.checkOut) return 0;
  const minutes = (new Date(record.checkOut).getTime() - new Date(record.checkIn).getTime()) / 60000;
  return minutes > 0 ? minutes : 0;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

export function MyAttendancePage() {
  // Lets the notification bell deep-link straight into a tab (e.g. a
  // regularization decision notification lands on ?tab=requests).
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = requestedTab === 'requests' ? 'requests' : 'history';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  // Preselected to the current month on open; '' means "no month filter"
  // — the full-history view, reachable via the "Full history" button.
  const [month, setMonth] = useState(currentMonth());
  const [offset, setOffset] = useState(0);

  const { user } = useAuth();
  const [joiningDate, setJoiningDate] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    if (!user?.employeeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileLoaded(true);
      return;
    }
    getMyProfile(user.employeeId)
      .then((profile) => setJoiningDate(profile.dateOfJoining))
      .catch(() => setJoiningDate(null))
      .finally(() => setProfileLoaded(true));
  }, [user?.employeeId]);

  // Default view is the whole employment span, joining date to today — a
  // month filter only narrows it. A month before the employee ever joined
  // has no data to show, full stop.
  const isBeforeJoining = month !== '' && !!joiningDate && month < joiningDate.slice(0, 7);
  const range = month === '' ? { from: joiningDate ?? formatDate(new Date()), to: formatDate(new Date()) } : monthRange(month);

  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [requests, setRequests] = useState<AttendanceRegularization[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalDate, setModalDate] = useState<string | null>(null);
  const [requestedStatus, setRequestedStatus] = useState<Attendance['status']>('present');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'history') {
        if (!profileLoaded) return;
        if (isBeforeJoining) {
          setAttendance([]);
          return;
        }
        // Backend fills every day in [from, to] with holiday/weekoff/leave/
        // absent as needed and returns the whole range unpaginated.
        const result = await listMyAttendance({ from: range.from, to: range.to });
        setAttendance(result.data);
      } else {
        const result = await listMyRegularizations({ limit: LIMIT, offset });
        setRequests(result.data);
        setTotal(result.pagination.total);
      }
    } catch {
      setError('Could not load your attendance.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, month, joiningDate, profileLoaded, offset]);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setOffset(0);
  }

  function openModal(date: string) {
    setModalDate(date);
    setRequestedStatus('present');
    setReason('');
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (!modalDate || !reason.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await createRegularization({ date: modalDate, requestedStatus, reason: reason.trim() });
      setModalDate(null);
      if (activeTab === 'requests') load();
    } catch {
      setSubmitError('Could not submit your request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { key: 'history', label: 'History' },
            { key: 'requests', label: 'My Requests' },
          ]}
          active={activeTab}
          onChange={(key) => switchTab(key as Tab)}
        />
        <Button variant="secondary" onClick={() => openModal(formatDate(new Date()))}>
          Request a correction
        </Button>
      </div>

      {activeTab === 'history' && (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-48">
            <Input
              id="attendance-month"
              type="month"
              label="Month"
              min={joiningDate ? joiningDate.slice(0, 7) : undefined}
              max={currentMonth()}
              value={month}
              onChange={(event) => {
                setOffset(0);
                // Belt-and-braces: the max attribute stops the picker UI,
                // but a typed/pasted value could still slip past it.
                setMonth(event.target.value > currentMonth() ? currentMonth() : event.target.value);
              }}
            />
          </div>
          {month !== '' && (
            <Button variant="secondary" onClick={() => setMonth('')}>
              Full history
            </Button>
          )}
        </div>
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {activeTab === 'history' && isBeforeJoining && (
        <EmptyStateCard
          title="No attendance to show"
          description={`Your joining date is ${formatDisplayDate(joiningDate)}.`}
        />
      )}

      {activeTab === 'history' && !isBeforeJoining && (
        <Table
          isLoading={isLoading}
          rows={attendance}
          rowKey={(r) => r.id}
          emptyMessage="No attendance records in this range."
          columns={[
            { key: 'date', header: 'Date', render: (r) => formatDisplayDate(r.date) },
            { key: 'checkIn', header: 'Check In', render: (r) => formatTime(r.checkIn) },
            { key: 'checkOut', header: 'Check Out', render: (r) => formatTime(r.checkOut) },
            {
              key: 'workingHours',
              header: 'Working Hrs',
              render: (r) => (r.checkIn && r.checkOut ? formatDuration(workedMinutes(r)) : '—'),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
                  {r.status === 'leave' && r.leaveTypeName ? r.leaveTypeName : r.status.replace('_', ' ')}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: '',
              className: 'w-40 text-right',
              render: (r) => (
                <button
                  type="button"
                  onClick={() => openModal(r.date)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Request correction
                </button>
              ),
            },
          ]}
        />
      )}

      {activeTab === 'requests' && (
        <>
          <Table
            isLoading={isLoading}
            rows={requests}
            rowKey={(r) => r.id}
            emptyMessage="You haven't raised any regularization requests."
            columns={[
              { key: 'date', header: 'Date', render: (r) => formatDisplayDate(r.attendance?.date) },
              { key: 'requestedStatus', header: 'Requested Status', render: (r) => r.requestedStatus.replace('_', ' ') },
              { key: 'reason', header: 'Reason', render: (r) => r.reason },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>,
              },
            ]}
          />
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {modalDate && (
        <Modal title={`Request a correction for ${formatDisplayDate(modalDate)}`} onClose={() => setModalDate(null)}>
          <div className="space-y-4">
            <Select
              id="regularization-status"
              label="What should this day be marked as?"
              value={requestedStatus}
              onChange={(event) => setRequestedStatus(event.target.value as Attendance['status'])}
              options={STATUS_OPTIONS}
            />
            <div>
              <label htmlFor="regularization-reason" className="mb-1.5 block text-sm font-medium text-ink">
                Reason
              </label>
              <textarea
                id="regularization-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Let your manager know what happened"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {submitError && <p className="text-sm text-danger">{submitError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalDate(null)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!reason.trim()}>
                Submit request
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
