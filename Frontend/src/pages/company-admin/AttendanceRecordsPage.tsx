import { useEffect, type ComponentType, useState } from 'react';
import axios from 'axios';
import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Coffee,
  HelpCircle,
  LogIn,
  LogOut,
  MapPin,
  PartyPopper,
  Search,
  TimerReset,
  Video,
  XCircle,
} from 'lucide-react';
import { Table, type Column } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { Avatar } from '../../components/ui/Avatar';
import { DetailRow } from '../../components/ui/DetailRow';
import { PunchTime } from '../../components/PunchTime';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useToast } from '../../context/toast-context';
import {
  bulkUpdateAttendanceStatus,
  getAttendanceVideoUrl,
  listAttendanceRoster,
  type AttendanceRosterRow,
} from '../../api/companyAdmin/attendanceRecords';
import { listLeaveTypes, type LeaveType } from '../../api/companyAdmin/leaveBalance';
import { useAuth } from '../../context/auth-context';
import { useAttendanceOrgFilters } from './components/useAttendanceOrgFilters';
import { groupRowsByOrg } from './components/groupRowsByOrg';
import { OrgGroupHeading } from './components/OrgGroupHeading';
import { formatDisplayDate } from '../../utils/dateDisplay';

const LIMIT = 20;
const GROUP_LIMIT = 100;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  present: 'success',
  on_duty: 'success',
  half_day: 'warning',
  absent: 'danger',
  leave: 'neutral',
  holiday: 'neutral',
  weekoff: 'neutral',
  not_marked: 'warning',
};

const STATUS_ICON: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  present: CheckCircle2,
  on_duty: CheckCircle2,
  half_day: TimerReset,
  absent: XCircle,
  leave: CalendarClock,
  holiday: PartyPopper,
  weekoff: Coffee,
  not_marked: HelpCircle,
};

function statusLabel(record: AttendanceRosterRow): string {
  return record.status === 'leave' && record.leaveTypeName ? record.leaveTypeName : record.status.replace('_', ' ');
}

function StatusBadge({ record }: { record: AttendanceRosterRow }) {
  const Icon = STATUS_ICON[record.status] ?? HelpCircle;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={STATUS_TONE[record.status] ?? 'neutral'}>
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
          {statusLabel(record)}
        </span>
      </Badge>
      {record.checkoutMissed && (
        <Badge tone="danger" title="No check-out within 12h 30m of check-in — needs a regularization">
          Missed Checkout
        </Badge>
      )}
    </span>
  );
}

// Every status-ish value in both the filter and the "Change Status" modal
// is expressed as a plain string: 'present' | 'absent' | 'half_day', or
// 'leave:<leaveTypeId>' for a specific company leave type — parsed back
// into {status, leaveTypeId} right before calling the API. The filter also
// allows '' ("All Status"), which the modal never offers.
const BASE_STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'half_day', label: 'Half Day' },
];

function parseStatusValue(value: string): { status: 'present' | 'absent' | 'half_day' | 'leave'; leaveTypeId?: string } {
  if (value.startsWith('leave:')) return { status: 'leave', leaveTypeId: value.slice('leave:'.length) };
  return { status: value as 'present' | 'absent' | 'half_day' };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Working hours for a single day — only meaningful once both punches exist.
function workedMinutes(record: AttendanceRosterRow): number {
  if (!record.checkIn || !record.checkOut) return 0;
  const minutes = (new Date(record.checkOut).getTime() - new Date(record.checkIn).getTime()) / 60000;
  return minutes > 0 ? minutes : 0;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

function AttendanceCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </>
  );
}

interface AttendanceCardProps {
  record: AttendanceRosterRow;
  selected: boolean;
  // Null when the caller can't change status (e.g. Group Admin, read-only).
  onToggleSelect: (() => void) | null;
  onOpenVideo: (type: 'checkin' | 'checkout') => void;
}

function AttendanceCard({ record, selected, onToggleSelect, onOpenVideo }: AttendanceCardProps) {
  const worked = record.checkIn && record.checkOut ? formatDuration(workedMinutes(record)) : null;
  return (
    <div
      className={[
        'rounded-2xl border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5',
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <label className="flex min-w-0 items-center gap-3">
          {onToggleSelect && (
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-border accent-primary"
              checked={selected}
              onChange={onToggleSelect}
            />
          )}
          <Avatar src={record.photoDownloadUrl} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{record.name || record.employeeCode || '—'}</p>
            <p className="text-xs text-ink-muted">{record.employeeCode}</p>
          </div>
        </label>
        <div className="shrink-0">
          <StatusBadge record={record} />
        </div>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow icon={LogIn} label="Check In" value={<PunchTime value={record.checkIn} />} />
        <DetailRow icon={LogOut} label="Check Out" value={<PunchTime value={record.checkOut} />} />
        <DetailRow icon={TimerReset} label="Working Hrs" value={worked ?? '—'} />
        {record.kioskLocationName && <DetailRow icon={MapPin} label="Location" value={record.kioskLocationName} />}
      </div>

      <div className="mt-3.5 flex items-center gap-1 border-t border-border pt-3">
        {record.attendanceId && record.checkIn ? (
          <button
            type="button"
            onClick={() => onOpenVideo('checkin')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-page hover:text-primary"
          >
            <Video className="h-3.5 w-3.5" strokeWidth={1.75} />
            Check-in
          </button>
        ) : (
          <span className="flex flex-1 items-center justify-center py-1.5 text-xs font-medium text-ink-muted">—</span>
        )}
        {record.attendanceId && record.checkOut ? (
          <button
            type="button"
            onClick={() => onOpenVideo('checkout')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-page hover:text-primary"
          >
            <Video className="h-3.5 w-3.5 rotate-180" strokeWidth={1.75} />
            Check-out
          </button>
        ) : (
          <span className="flex flex-1 items-center justify-center py-1.5 text-xs font-medium text-ink-muted">—</span>
        )}
      </div>
    </div>
  );
}

// Reused as-is by Brand Admin (attendance:read/attendance:update and now
// leave_type:read are all brand-scoped or granted server-side) — no
// portal-specific branching, same convention as ScannerAccountsPage.
//
// groupMode (Group Admin): adds a Company filter ("All Companies" = every
// company in the Group on one list) and labels each row with its company/
// brand. The bulk "Change Status" controls are gated on attendance:update
// for every portal — Group Admin only holds attendance:read, so it's
// read-only for them.
export function AttendanceRecordsPage({ groupMode = false }: { groupMode?: boolean }) {
  const showToast = useToast();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission('attendance:update');
  const today = formatDate(new Date());
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const org = useAttendanceOrgFilters(groupMode);
  const { brands, brandFilter, setBrandFilter, companyId, brandId } = org;
  const [offset, setOffset] = useState(0);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  const [records, setRecords] = useState<AttendanceRosterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState('present');
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const statusOptions = [
    ...BASE_STATUS_OPTIONS,
    ...leaveTypes.map((lt) => ({ value: `leave:${lt.id}`, label: lt.name })),
  ];

  // Leave types are per company, so a group-wide view filters on "any
  // leave" instead (the backend accepts status=leave with no leaveTypeId).
  const filterStatusOptions = groupMode ? [...BASE_STATUS_OPTIONS, { value: 'leave', label: 'On Leave' }] : statusOptions;

  useEffect(() => {
    if (groupMode) return;
    listLeaveTypes()
      .then(setLeaveTypes)
      .catch(() => setLeaveTypes([]));
  }, [groupMode]);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const { status, leaveTypeId } = statusFilter ? parseStatusValue(statusFilter) : { status: undefined, leaveTypeId: undefined };
      const result = await listAttendanceRoster({
        date,
        search: search.trim() || undefined,
        status,
        leaveTypeId,
        brandId,
        companyId,
        limit: groupMode ? GROUP_LIMIT : LIMIT,
        offset,
      });
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
  }, [date, search, statusFilter, brandId, companyId, offset]);

  // Marking is per-date — a selection made for one date has no meaning on
  // another, so switching dates starts fresh.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds(new Set());
  }, [date]);

  async function openVideo(record: AttendanceRosterRow, type: 'checkin' | 'checkout') {
    if (!record.attendanceId) return;
    setVideoError(null);
    try {
      const url = await getAttendanceVideoUrl(record.attendanceId, type, groupMode ? record.companyId : undefined);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setVideoError('Could not open this video. It may have expired or been cleaned up.');
    }
  }

  function toggleSelected(employeeId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  const allOnPageSelected = records.length > 0 && records.every((r) => selectedIds.has(r.employeeId));

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) records.forEach((r) => next.delete(r.employeeId));
      else records.forEach((r) => next.add(r.employeeId));
      return next;
    });
  }

  function openBulkModal() {
    setBulkStatusValue('present');
    setBulkError(null);
    setIsBulkModalOpen(true);
  }

  async function submitBulkStatus() {
    setIsBulkSubmitting(true);
    setBulkError(null);
    try {
      const { status, leaveTypeId } = parseStatusValue(bulkStatusValue);
      const result = await bulkUpdateAttendanceStatus({
        employeeIds: [...selectedIds],
        date,
        status,
        leaveTypeId,
      });

      if (result.updated > 0) {
        showToast(`Updated attendance for ${result.updated} employee${result.updated === 1 ? '' : 's'}.`, 'success');
      }
      if (result.failures.length > 0) {
        const detail = result.failures.map((f) => `${f.name || f.employeeId}: ${f.error}`).join('; ');
        showToast(`${result.failures.length} could not be updated — ${detail}`, 'error');
      }
      if (result.updated === 0 && result.failures.length === 0) {
        showToast('Selected employees already had this status.', 'success');
      }

      setIsBulkModalOpen(false);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      setBulkError(extractError(err, 'Could not update attendance status.'));
    } finally {
      setIsBulkSubmitting(false);
    }
  }

  // Group Admin view: one section per Company > Brand instead of a single
  // mixed list (rows already arrive sorted company > brand > name).
  const orgGroups = groupRowsByOrg(records);

  const columns: Column<AttendanceRosterRow>[] = [
    ...(canUpdate ? [{
      key: 'select',
      header: '',
      className: 'w-10',
      render: (r: AttendanceRosterRow) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-primary"
          checked={selectedIds.has(r.employeeId)}
          onChange={() => toggleSelected(r.employeeId)}
        />
      ),
    }] : []),
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar src={r.photoDownloadUrl} size="sm" />
          <span>{r.name || r.employeeCode || '—'}</span>
        </div>
      ),
    },
    { key: 'checkIn', header: 'Check In', render: (r) => <PunchTime value={r.checkIn} /> },
    { key: 'checkOut', header: 'Check Out', render: (r) => <PunchTime value={r.checkOut} /> },
    {
      key: 'workingHours',
      header: 'Working Hrs',
      render: (r) => (r.checkIn && r.checkOut ? formatDuration(workedMinutes(r)) : '—'),
    },
    {
      key: 'location',
      header: 'Location',
      render: (r) =>
        r.kioskLocationName ? (
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
            {r.kioskLocationName}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge record={r} />,
    },
    {
      key: 'video',
      header: 'Video',
      className: 'w-28',
      // One slot per leg, independently — a check-in video button
      // only when the employee actually checked in, a check-out
      // one only when they actually checked out, a plain dash for
      // whichever leg hasn't happened yet.
      render: (r) => {
        const attendanceId = r.attendanceId;
        return (
          <div className="flex items-center gap-1">
            {attendanceId && r.checkIn ? (
              <button
                type="button"
                onClick={() => openVideo(r, 'checkin')}
                aria-label="View check-in video"
                title="Check-in video"
                className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-primary"
              >
                <Video className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            ) : (
              <span className="w-7 text-center text-ink-muted">—</span>
            )}
            {attendanceId && r.checkOut ? (
              <button
                type="button"
                onClick={() => openVideo(r, 'checkout')}
                aria-label="View check-out video"
                title="Check-out video"
                className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-primary"
              >
                <Video className="h-3.5 w-3.5 rotate-180" strokeWidth={1.75} />
              </button>
            ) : (
              <span className="w-7 text-center text-ink-muted">—</span>
            )}
          </div>
        );
      },
    },
];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-40">
          <Input
            id="attendance-records-date"
            type="date"
            label="Date"
            max={today}
            value={date}
            onChange={(event) => {
              setOffset(0);
              setDate(event.target.value);
            }}
          />
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="attendance-records-search" className="mb-1.5 block text-sm font-medium text-ink">
            Search employee
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" strokeWidth={1.75} />
            <input
              id="attendance-records-search"
              type="text"
              value={search}
              onChange={(event) => {
                setOffset(0);
                setSearch(event.target.value);
              }}
              placeholder="Name or employee code"
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="w-full sm:w-48">
          <Select
            id="attendance-records-status"
            label="Status"
            value={statusFilter}
            onChange={(event) => {
              setOffset(0);
              setStatusFilter(event.target.value);
            }}
            options={[{ value: '', label: 'All Status' }, ...filterStatusOptions]}
          />
        </div>
        {groupMode && (
          <div className="w-full sm:w-48">
            <Select
              id="attendance-records-company"
              label="Company"
              value={org.companyFilter}
              onChange={(event) => {
                setOffset(0);
                org.setCompanyFilter(event.target.value);
              }}
              options={[
                { value: '', label: 'All Companies' },
                ...org.companies.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
        )}
        {brands.length > 1 && (
          <div className="w-full sm:w-48">
            <Select
              id="attendance-records-brand"
              label="Brand"
              value={brandFilter}
              onChange={(event) => {
                setOffset(0);
                setBrandFilter(event.target.value);
              }}
              options={[{ value: '', label: 'All Brands' }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
            />
          </div>
        )}
      </div>

      {canUpdate && (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-xs">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={allOnPageSelected}
            onChange={toggleSelectAllOnPage}
            disabled={records.length === 0}
          />
          Select all on this page
        </label>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && <Badge tone="neutral">{selectedIds.size} selected</Badge>}
          <Button onClick={openBulkModal} disabled={selectedIds.size === 0}>
            Change Status
          </Button>
        </div>
      </div>
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {videoError && <p className="mb-3 text-sm text-danger">{videoError}</p>}

      {!isLoading && !error && records.length === 0 && (
        <EmptyStateCard
          icon={CalendarCheck}
          title="No employees found"
          description={search || statusFilter ? 'Try a different search term or status.' : 'No active employees to show.'}
        />
      )}

      {(isLoading || records.length > 0) && (
        <>
          <div className="hidden md:block">
            {groupMode && !isLoading ? (
              <div className="space-y-5">
                {orgGroups.map((group) => (
                  <section key={group.key}>
                    <div className="mb-2">
                      <OrgGroupHeading companyName={group.companyName} brandName={group.brandName} count={group.rows.length} />
                    </div>
                    <Table rows={group.rows} rowKey={(r) => r.employeeId} columns={columns} />
                  </section>
                ))}
              </div>
            ) : (
              <Table isLoading={isLoading} rows={records} rowKey={(r) => r.employeeId} columns={columns} />
            )}
          </div>

          <div className="space-y-5 md:hidden">
            {isLoading && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AttendanceCardSkeleton />
              </div>
            )}
            {!isLoading &&
              (groupMode ? orgGroups : [{ key: 'all', companyName: null, brandName: null, rows: records }]).map((group) => (
                <section key={group.key}>
                  {groupMode && (
                    <div className="mb-2">
                      <OrgGroupHeading companyName={group.companyName} brandName={group.brandName} count={group.rows.length} />
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {group.rows.map((r) => (
                      <AttendanceCard
                        key={r.employeeId}
                        record={r}
                        selected={selectedIds.has(r.employeeId)}
                        onToggleSelect={canUpdate ? () => toggleSelected(r.employeeId) : null}
                        onOpenVideo={(type) => openVideo(r, type)}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </div>

          <Pagination total={total} limit={groupMode ? GROUP_LIMIT : LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {isBulkModalOpen && (
        <Modal title="Change attendance status" onClose={() => setIsBulkModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Setting status for {selectedIds.size} employee{selectedIds.size === 1 ? '' : 's'} on{' '}
              {formatDisplayDate(date)}.
            </p>
            <Select
              id="bulk-status"
              label="Status"
              value={bulkStatusValue}
              onChange={(event) => setBulkStatusValue(event.target.value)}
              options={statusOptions}
            />
            {bulkError && <p className="text-sm text-danger">{bulkError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsBulkModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitBulkStatus} isLoading={isBulkSubmitting}>
                Apply
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
