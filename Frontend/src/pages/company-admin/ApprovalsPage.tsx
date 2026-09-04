import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bookmark, CalendarRange, CalendarX, Check, Clock, FileText, History, Layers, MapPin, Tag, User, X } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { Pagination } from '../../components/ui/Pagination';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { RejectReasonModal } from '../../components/RejectReasonModal';
import { ApproveRegularizationModal } from '../../components/ApproveRegularizationModal';
import { ApprovalHistoryModal } from '../../components/ApprovalHistoryModal';
import { RequestCard, RequestCardSkeleton, RequestStatusBadge } from '../../components/RequestCard';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../context/auth-context';
import {
  approveCompOffCredit,
  approveLeaveRequest,
  approveOdRequest,
  approveRegularization,
  getCompOffHistory,
  getLeaveRequestHistory,
  getOdRequestHistory,
  getRegularizationHistory,
  listCompOffCredits,
  listLeaveRequests,
  listOdRequests,
  listRegularizations,
  rejectCompOffCredit,
  rejectLeaveRequest,
  rejectOdRequest,
  rejectRegularization,
  type AttendanceRegularization,
  type CompOffCredit,
  type LeaveRequest,
  type OdRequest,
  type RequestEmployee,
} from '../../api/companyAdmin/approvals';
import { listEmployees } from '../../api/companyAdmin/employees';
import type { Employee } from '../../api/tenancy';
import { AssignCompOffModal } from './components/AssignCompOffModal';
import { formatDisplayDate, formatDisplayTime } from '../../utils/dateDisplay';

function formatRequestedTimes(r: AttendanceRegularization): string {
  if (!r.requestedCheckIn && !r.requestedCheckOut) return '—';
  return `${formatDisplayTime(r.requestedCheckIn)} → ${formatDisplayTime(r.requestedCheckOut)}`;
}

function employeeLabel(employee: RequestEmployee | undefined, employeeId: string) {
  return employee ? [employee.name, employee.employeeCode].filter(Boolean).join(' · ') : employeeId;
}

function EmployeeCell({ employee, employeeId }: { employee?: RequestEmployee; employeeId: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar src={employee?.photoDownloadUrl} size="sm" />
      <span>{employeeLabel(employee, employeeId)}</span>
    </div>
  );
}

type Tab = 'leave' | 'od' | 'regularization' | 'compOff';

const LIMIT = 20;

function ActionButtons({
  canApprove,
  canReject,
  onApprove,
  onReject,
  onHistory,
}: {
  canApprove: boolean;
  canReject: boolean;
  onApprove: () => void;
  onReject: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        onClick={onHistory}
        aria-label="View history"
        className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
      >
        <History className="h-4 w-4" strokeWidth={1.75} />
      </button>
      {canApprove && (
        <button
          type="button"
          onClick={onApprove}
          aria-label="Approve"
          className="rounded-md p-1.5 text-ink-muted hover:bg-success/10 hover:text-success"
        >
          <Check className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
      {canReject && (
        <button
          type="button"
          onClick={onReject}
          aria-label="Reject"
          className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

interface ApprovalsPageProps {
  // Merged into every list call's params — set by the Brand Admin portal
  // (brandId) or the Group Admin portal's read-only company drill-in
  // (companyId). Approve/reject buttons stay hidden or shown purely by
  // hasPermission(), so this component needs no other change to serve both
  // a scoped, actionable Brand Admin view and a read-only Group Admin view.
  extraParams?: { companyId?: string; brandId?: string };
}

export function ApprovalsPage({ extraParams = {} }: ApprovalsPageProps = {}) {
  const { hasPermission } = useAuth();
  // Lets the notification bell deep-link straight into a tab (e.g. clicking
  // a "new OD request" notification lands on ?tab=od) instead of always
  // defaulting to Leave Requests.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = (['leave', 'od', 'regularization', 'compOff'] as Tab[]).includes(requestedTab as Tab)
    ? (requestedTab as Tab)
    : 'leave';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [odRequests, setOdRequests] = useState<OdRequest[]>([]);
  const [regularizations, setRegularizations] = useState<AttendanceRegularization[]>([]);
  const [compOffCredits, setCompOffCredits] = useState<CompOffCredit[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ tab: Tab; id: string } | null>(null);
  const [approveRegularizationTarget, setApproveRegularizationTarget] = useState<AttendanceRegularization | null>(
    null
  );
  const [historyTarget, setHistoryTarget] = useState<{ tab: Tab; id: string } | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAssignCompOff, setShowAssignCompOff] = useState(false);

  const statusOptions =
    activeTab === 'compOff'
      ? [
          { value: 'pending_approval', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'expired', label: 'Expired' },
          { value: 'used', label: 'Used' },
        ]
      : [
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ];

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const params = { status: statusFilter || undefined, limit: LIMIT, offset, ...extraParams };
      if (activeTab === 'leave') {
        const result = await listLeaveRequests(params);
        setLeaveRequests(result.data);
        setTotal(result.pagination.total);
      } else if (activeTab === 'od') {
        const result = await listOdRequests(params);
        setOdRequests(result.data);
        setTotal(result.pagination.total);
      } else if (activeTab === 'regularization') {
        const result = await listRegularizations(params);
        setRegularizations(result.data);
        setTotal(result.pagination.total);
      } else {
        const result = await listCompOffCredits(params);
        setCompOffCredits(result.data);
        setTotal(result.pagination.total);
      }
    } catch {
      setError('Could not load approvals.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, statusFilter, offset]);

  // Only needed to populate the "Assign Comp-Off" employee picker — lazy so
  // a caller without comp_off:credit never pays for this extra request.
  useEffect(() => {
    if (activeTab === 'compOff' && hasPermission('comp_off:credit') && employees.length === 0) {
      listEmployees({ status: 'active', limit: 100, ...extraParams })
        .then((result) => setEmployees(result.data))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setStatusFilter('');
    setOffset(0);
  }

  async function handleLeaveApprove(id: string) {
    await approveLeaveRequest(id);
    load();
  }
  async function handleOdApprove(id: string) {
    await approveOdRequest(id);
    load();
  }
  async function confirmRegularizationApprove(overrides: { checkInTime?: string; checkOutTime?: string }) {
    if (!approveRegularizationTarget) return;
    await approveRegularization(approveRegularizationTarget.id, overrides);
    setApproveRegularizationTarget(null);
    load();
  }
  async function handleCompOffApprove(id: string) {
    await approveCompOffCredit(id);
    load();
  }

  async function confirmReject(reason: string) {
    if (!rejectTarget) return;
    const { tab, id } = rejectTarget;
    if (tab === 'leave') await rejectLeaveRequest(id, reason);
    else if (tab === 'od') await rejectOdRequest(id, reason);
    else if (tab === 'regularization') await rejectRegularization(id, reason);
    else await rejectCompOffCredit(id, reason);
    setRejectTarget(null);
    load();
  }

  function loadHistory() {
    if (!historyTarget) return Promise.resolve([]);
    const { tab, id } = historyTarget;
    if (tab === 'leave') return getLeaveRequestHistory(id);
    if (tab === 'od') return getOdRequestHistory(id);
    if (tab === 'regularization') return getRegularizationHistory(id);
    return getCompOffHistory(id);
  }

  return (
    <div>
      <Tabs
        items={[
          { key: 'leave', label: 'Leave Requests' },
          { key: 'od', label: 'OD Requests' },
          { key: 'regularization', label: 'Regularizations' },
          { key: 'compOff', label: 'Comp-Off Credits' },
        ]}
        active={activeTab}
        onChange={(key) => switchTab(key as Tab)}
      />

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <FilterSelect
          value={statusFilter}
          onChange={(value) => {
            setOffset(0);
            setStatusFilter(value);
          }}
          placeholder="All statuses"
          ariaLabel="Filter by status"
          options={statusOptions}
        />
        {activeTab === 'compOff' && hasPermission('comp_off:credit') && (
          <Button type="button" onClick={() => setShowAssignCompOff(true)}>
            Assign Comp-Off
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {activeTab === 'leave' && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={leaveRequests}
              rowKey={(r) => r.id}
              emptyMessage="No leave requests found."
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => <EmployeeCell employee={r.employee} employeeId={r.employeeId} />,
                },
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
                  render: (r) => <RequestStatusBadge status={r.status} rejectionReason={r.rejectionReason} />,
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-28 text-right',
                  render: (r) => (
                    <ActionButtons
                      canApprove={r.status === 'pending' && hasPermission('leave_request:approve')}
                      canReject={r.status === 'pending' && hasPermission('leave_request:reject')}
                      onApprove={() => handleLeaveApprove(r.id)}
                      onReject={() => setRejectTarget({ tab: 'leave', id: r.id })}
                      onHistory={() => setHistoryTarget({ tab: 'leave', id: r.id })}
                    />
                  ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading && leaveRequests.length === 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <EmptyStateCard icon={FileText} title="No leave requests" description="Leave requests will show up here." />
              </div>
            )}
            {!isLoading &&
              leaveRequests.map((r) => (
                <RequestCard
                  key={r.id}
                  name={employeeLabel(r.employee, r.employeeId)}
                  photoUrl={r.employee?.photoDownloadUrl}
                  tag={r.leaveType?.name}
                  status={r.status}
                  rejectionReason={r.rejectionReason}
                  fields={[
                    { icon: User, label: 'Employee', value: employeeLabel(r.employee, r.employeeId) },
                    { icon: Layers, label: 'Type', value: r.leaveType?.name ?? '—' },
                    { icon: CalendarRange, label: 'Dates', value: `${formatDisplayDate(r.fromDate)} – ${formatDisplayDate(r.toDate)}` },
                    { icon: Clock, label: 'Days', value: r.days },
                    { icon: FileText, label: 'Reason', value: r.reason ?? '—' },
                    { icon: Bookmark, label: 'Status', value: <RequestStatusBadge status={r.status} rejectionReason={r.rejectionReason} /> },
                  ]}
                  canApprove={r.status === 'pending' && hasPermission('leave_request:approve')}
                  canReject={r.status === 'pending' && hasPermission('leave_request:reject')}
                  onApprove={() => handleLeaveApprove(r.id)}
                  onReject={() => setRejectTarget({ tab: 'leave', id: r.id })}
                  onHistory={() => setHistoryTarget({ tab: 'leave', id: r.id })}
                />
              ))}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {activeTab === 'od' && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={odRequests}
              rowKey={(r) => r.id}
              emptyMessage="No OD requests found."
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => <EmployeeCell employee={r.employee} employeeId={r.employeeId} />,
                },
                {
                  key: 'dates',
                  header: 'Dates',
                  render: (r) => `${formatDisplayDate(r.fromDate)} → ${formatDisplayDate(r.toDate)}`,
                },
                { key: 'purpose', header: 'Purpose', render: (r) => r.purpose },
                { key: 'location', header: 'Location', render: (r) => r.location ?? '—' },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => <RequestStatusBadge status={r.status} rejectionReason={r.rejectionReason} />,
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-28 text-right',
                  render: (r) => (
                    <ActionButtons
                      canApprove={r.status === 'pending' && hasPermission('od_request:approve')}
                      canReject={r.status === 'pending' && hasPermission('od_request:reject')}
                      onApprove={() => handleOdApprove(r.id)}
                      onReject={() => setRejectTarget({ tab: 'od', id: r.id })}
                      onHistory={() => setHistoryTarget({ tab: 'od', id: r.id })}
                    />
                  ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading && odRequests.length === 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <EmptyStateCard icon={FileText} title="No OD requests" description="OD requests will show up here." />
              </div>
            )}
            {!isLoading &&
              odRequests.map((r) => (
                <RequestCard
                  key={r.id}
                  name={employeeLabel(r.employee, r.employeeId)}
                  photoUrl={r.employee?.photoDownloadUrl}
                  tag={r.purpose}
                  status={r.status}
                  rejectionReason={r.rejectionReason}
                  fields={[
                    { icon: User, label: 'Employee', value: employeeLabel(r.employee, r.employeeId) },
                    { icon: CalendarRange, label: 'Dates', value: `${formatDisplayDate(r.fromDate)} – ${formatDisplayDate(r.toDate)}` },
                    { icon: FileText, label: 'Purpose', value: r.purpose },
                    { icon: MapPin, label: 'Location', value: r.location ?? '—' },
                    { icon: Bookmark, label: 'Status', value: <RequestStatusBadge status={r.status} rejectionReason={r.rejectionReason} /> },
                  ]}
                  canApprove={r.status === 'pending' && hasPermission('od_request:approve')}
                  canReject={r.status === 'pending' && hasPermission('od_request:reject')}
                  onApprove={() => handleOdApprove(r.id)}
                  onReject={() => setRejectTarget({ tab: 'od', id: r.id })}
                  onHistory={() => setHistoryTarget({ tab: 'od', id: r.id })}
                />
              ))}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {activeTab === 'regularization' && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={regularizations}
              rowKey={(r) => r.id}
              emptyMessage="No regularization requests found."
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => <EmployeeCell employee={r.employee} employeeId={r.employeeId} />,
                },
                { key: 'date', header: 'Date', render: (r) => formatDisplayDate(r.attendance?.date) },
                { key: 'requestedStatus', header: 'Requested Status', render: (r) => r.requestedStatus },
                { key: 'requestedTimes', header: 'Requested Time', render: formatRequestedTimes },
                { key: 'reason', header: 'Reason', render: (r) => r.reason },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => <RequestStatusBadge status={r.status} rejectionReason={r.rejectionReason} />,
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-28 text-right',
                  render: (r) => (
                    <ActionButtons
                      canApprove={r.status === 'pending' && hasPermission('attendance_regularization:approve')}
                      canReject={r.status === 'pending' && hasPermission('attendance_regularization:reject')}
                      onApprove={() => setApproveRegularizationTarget(r)}
                      onReject={() => setRejectTarget({ tab: 'regularization', id: r.id })}
                      onHistory={() => setHistoryTarget({ tab: 'regularization', id: r.id })}
                    />
                  ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading && regularizations.length === 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <EmptyStateCard icon={FileText} title="No regularization requests" description="Regularization requests will show up here." />
              </div>
            )}
            {!isLoading &&
              regularizations.map((r) => (
                <RequestCard
                  key={r.id}
                  name={employeeLabel(r.employee, r.employeeId)}
                  photoUrl={r.employee?.photoDownloadUrl}
                  tag={r.requestedStatus}
                  status={r.status}
                  rejectionReason={r.rejectionReason}
                  fields={[
                    { icon: User, label: 'Employee', value: employeeLabel(r.employee, r.employeeId) },
                    { icon: CalendarRange, label: 'Date', value: formatDisplayDate(r.attendance?.date) },
                    { icon: Tag, label: 'Requested Status', value: r.requestedStatus },
                    { icon: Clock, label: 'Requested Time', value: formatRequestedTimes(r) },
                    { icon: FileText, label: 'Reason', value: r.reason },
                    { icon: Bookmark, label: 'Status', value: <RequestStatusBadge status={r.status} rejectionReason={r.rejectionReason} /> },
                  ]}
                  canApprove={r.status === 'pending' && hasPermission('attendance_regularization:approve')}
                  canReject={r.status === 'pending' && hasPermission('attendance_regularization:reject')}
                  onApprove={() => setApproveRegularizationTarget(r)}
                  onReject={() => setRejectTarget({ tab: 'regularization', id: r.id })}
                  onHistory={() => setHistoryTarget({ tab: 'regularization', id: r.id })}
                />
              ))}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {activeTab === 'compOff' && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={compOffCredits}
              rowKey={(r) => r.id}
              emptyMessage="No comp-off credits found."
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => <EmployeeCell employee={r.employee} employeeId={r.employeeId} />,
                },
                { key: 'earnedDate', header: 'Earned Date', render: (r) => formatDisplayDate(r.earnedDate) },
                { key: 'expiryDate', header: 'Expiry Date', render: (r) => (r.expiryDate ? formatDisplayDate(r.expiryDate) : 'Never') },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => <RequestStatusBadge status={r.status} rejectionReason={r.rejectionReason} />,
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-28 text-right',
                  render: (r) => (
                    <ActionButtons
                      canApprove={r.status === 'pending_approval' && hasPermission('comp_off:approve')}
                      canReject={r.status === 'pending_approval' && hasPermission('comp_off:reject')}
                      onApprove={() => handleCompOffApprove(r.id)}
                      onReject={() => setRejectTarget({ tab: 'compOff', id: r.id })}
                      onHistory={() => setHistoryTarget({ tab: 'compOff', id: r.id })}
                    />
                  ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading && compOffCredits.length === 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <EmptyStateCard icon={FileText} title="No comp-off credits" description="Comp-off credits will show up here." />
              </div>
            )}
            {!isLoading &&
              compOffCredits.map((r) => (
                <RequestCard
                  key={r.id}
                  name={employeeLabel(r.employee, r.employeeId)}
                  photoUrl={r.employee?.photoDownloadUrl}
                  status={r.status}
                  rejectionReason={r.rejectionReason}
                  fields={[
                    { icon: User, label: 'Employee', value: employeeLabel(r.employee, r.employeeId) },
                    { icon: CalendarRange, label: 'Earned Date', value: formatDisplayDate(r.earnedDate) },
                    { icon: CalendarX, label: 'Expiry Date', value: r.expiryDate ? formatDisplayDate(r.expiryDate) : 'Never' },
                    { icon: Bookmark, label: 'Status', value: <RequestStatusBadge status={r.status} rejectionReason={r.rejectionReason} /> },
                  ]}
                  canApprove={r.status === 'pending_approval' && hasPermission('comp_off:approve')}
                  canReject={r.status === 'pending_approval' && hasPermission('comp_off:reject')}
                  onApprove={() => handleCompOffApprove(r.id)}
                  onReject={() => setRejectTarget({ tab: 'compOff', id: r.id })}
                  onHistory={() => setHistoryTarget({ tab: 'compOff', id: r.id })}
                />
              ))}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {rejectTarget && (
        <RejectReasonModal
          title="Reject request"
          onClose={() => setRejectTarget(null)}
          onConfirm={confirmReject}
        />
      )}

      {approveRegularizationTarget && (
        <ApproveRegularizationModal
          regularization={approveRegularizationTarget}
          onClose={() => setApproveRegularizationTarget(null)}
          onConfirm={confirmRegularizationApprove}
        />
      )}

      {historyTarget && (
        <ApprovalHistoryModal
          title="Approval history"
          onClose={() => setHistoryTarget(null)}
          load={loadHistory}
        />
      )}

      {showAssignCompOff && (
        <AssignCompOffModal
          employees={employees}
          onClose={() => setShowAssignCompOff(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
