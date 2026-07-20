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
import {
  createRegularization,
  listMyAttendance,
  listMyRegularizations,
  type Attendance,
  type AttendanceRegularization,
} from '../../api/ess/attendance';
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

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return formatDate(d);
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MyAttendancePage() {
  // Lets the notification bell deep-link straight into a tab (e.g. a
  // regularization decision notification lands on ?tab=requests).
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = requestedTab === 'requests' ? 'requests' : 'history';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(formatDate(new Date()));
  const [offset, setOffset] = useState(0);

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
        const result = await listMyAttendance({ from, to, limit: LIMIT, offset });
        setAttendance(result.data);
        setTotal(result.pagination.total);
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
  }, [activeTab, from, to, offset]);

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
        <div className="mb-3 flex flex-wrap gap-3">
          <div className="w-full sm:w-40">
            <Input
              id="attendance-from"
              type="date"
              label="From"
              value={from}
              onChange={(event) => {
                setOffset(0);
                setFrom(event.target.value);
              }}
            />
          </div>
          <div className="w-full sm:w-40">
            <Input
              id="attendance-to"
              type="date"
              label="To"
              value={to}
              onChange={(event) => {
                setOffset(0);
                setTo(event.target.value);
              }}
            />
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {activeTab === 'history' && (
        <>
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
                key: 'status',
                header: 'Status',
                render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status.replace('_', ' ')}</Badge>,
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
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
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
        <Modal title="Request an attendance correction" onClose={() => setModalDate(null)}>
          <div className="space-y-4">
            <Input
              id="regularization-date"
              type="date"
              label="Date"
              value={modalDate}
              onChange={(event) => setModalDate(event.target.value)}
            />
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
