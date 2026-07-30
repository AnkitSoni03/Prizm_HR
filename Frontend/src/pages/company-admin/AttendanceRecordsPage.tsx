import { useEffect, useState } from 'react';
import { CalendarCheck, Video } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import {
  getAttendanceVideoUrl,
  listAttendanceRecords,
  type AttendanceRecord,
} from '../../api/companyAdmin/attendanceRecords';
import { formatDisplayDate } from '../../utils/dateDisplay';

const LIMIT = 20;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  present: 'success',
  on_duty: 'success',
  half_day: 'warning',
  absent: 'danger',
  leave: 'neutral',
  holiday: 'neutral',
  weekoff: 'neutral',
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return formatDate(d);
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Working hours for a single day — only meaningful once both punches exist
// (an open check-in with no check-out yet, or a leave/holiday/weekoff day
// with neither, both correctly contribute 0).
function workedMinutes(record: AttendanceRecord): number {
  if (!record.checkIn || !record.checkOut) return 0;
  const minutes = (new Date(record.checkOut).getTime() - new Date(record.checkIn).getTime()) / 60000;
  return minutes > 0 ? minutes : 0;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

// Reused as-is by Brand Admin (attendance:read is already brand-scoped
// server-side) — no portal-specific branching, same convention as
// ScannerAccountsPage.
export function AttendanceRecordsPage() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(formatDate(new Date()));
  const [offset, setOffset] = useState(0);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listAttendanceRecords({ from, to, limit: LIMIT, offset });
      setRecords(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load attendance records.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, offset]);

  async function openVideo(id: string, type: 'checkin' | 'checkout') {
    setVideoError(null);
    try {
      const url = await getAttendanceVideoUrl(id, type);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setVideoError('Could not open this video. It may have expired or been cleaned up.');
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="w-full sm:w-40">
          <Input
            id="attendance-records-from"
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
            id="attendance-records-to"
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

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {videoError && <p className="mb-3 text-sm text-danger">{videoError}</p>}

      {!isLoading && !error && records.length === 0 && (
        <EmptyStateCard
          icon={CalendarCheck}
          title="No attendance records in this range"
          description="Try widening the date range above."
        />
      )}

      {(isLoading || records.length > 0) && (
        <>
          <Table
            isLoading={isLoading}
            rows={records}
            rowKey={(r) => r.id}
            columns={[
              { key: 'employee', header: 'Employee', render: (r) => r.employee?.name || r.employee?.employeeCode || '—' },
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
                render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status.replace('_', ' ')}</Badge>,
              },
              {
                key: 'video',
                header: 'Video',
                className: 'w-28',
                render: (r) => (
                  <div className="flex gap-1">
                    {r.videoObjectPathCheckin && (
                      <button
                        type="button"
                        onClick={() => openVideo(r.id, 'checkin')}
                        aria-label="View check-in video"
                        title="Check-in video"
                        className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-primary"
                      >
                        <Video className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                    {r.videoObjectPathCheckout && (
                      <button
                        type="button"
                        onClick={() => openVideo(r.id, 'checkout')}
                        aria-label="View check-out video"
                        title="Check-out video"
                        className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-primary"
                      >
                        <Video className="h-3.5 w-3.5 rotate-180" strokeWidth={1.75} />
                      </button>
                    )}
                    {!r.videoObjectPathCheckin && !r.videoObjectPathCheckout && '—'}
                  </div>
                ),
              },
            ]}
          />
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}
    </div>
  );
}
