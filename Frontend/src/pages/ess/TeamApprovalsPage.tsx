import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bookmark, CalendarRange, CalendarX, Check, Clock, FileText, History, Layers, MapPin, User, Users, X } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { RejectReasonModal } from '../../components/RejectReasonModal';
import { ApprovalHistoryModal } from '../../components/ApprovalHistoryModal';
import { RequestCard, RequestCardSkeleton, RequestStatusBadge } from '../../components/RequestCard';
import { ManagerApprovalStatus } from '../../components/ManagerApprovalStatus';
import { myManagerApprovalStatus } from '../../utils/managerApproval';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/auth-context';
import {
  approveLeaveRequest,
  approveOdRequest,
  getCompOffHistory,
  getLeaveRequestHistory,
  getOdRequestHistory,
  listCompOffCredits,
  listLeaveRequests,
  listOdRequests,
  rejectLeaveRequest,
  rejectOdRequest,
  type CompOffCredit,
  type LeaveRequest,
  type OdRequest,
  type RequestEmployee,
} from '../../api/companyAdmin/approvals';
import { listEmployees } from '../../api/companyAdmin/employees';
import type { Employee } from '../../api/tenancy';
import { AssignCompOffModal } from '../company-admin/components/AssignCompOffModal';
import { formatDisplayDate } from '../../utils/dateDisplay';

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

type Tab = 'leave' | 'od' | 'compOff';

const LIMIT = 20;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

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

// Two independent ways to land on this page's rows, auto-detected per tab
// from whichever permission the caller actually holds — never a client
// choice, since the backend is the one enforcing it either way:
//   - Company-wide "Approve Leave/OD Requests" power (leave_request:read/
//     approve/reject, od_request:read/approve/reject — see
//     powerCatalog.js's `approve_requests` bundle): sends `scope=company`,
//     sees every employee's requests.
//   - Direct-reports-only manager scope (leave_request:read_reports/
//     approve_reports/reject_reports — granted broadly to the whole
//     Employee role, same shape as employee:read_own: most employees have
//     zero direct reports and this page is just empty for them): sends
//     `scope=reports`.
// Neither is ever the default for MyLeavePage.tsx/MyOdPage.tsx's plain
// (no scope param) calls — see leaveRequest.routes.js/odRequest.routes.js's
// requireReadAccess. Attendance regularizations and comp-off approvals have
// no manager/company-wide scoping wired up yet, so they're deliberately not
// tabs here.
function resolveScope(hasPermission: (code: string) => boolean, domain: 'leave_request' | 'od_request') {
  if (hasPermission(`${domain}:read`)) return 'company' as const;
  if (hasPermission(`${domain}:read_reports`)) return 'reports' as const;
  return null;
}

// A leave request's Approve/Reject buttons here need to reflect the
// multi-manager AND-gate, not just "is it still pending": an admin-wide
// approve_requests holder can always decide (bypasses the chain), but a
// caller only holding approve_reports/reject_reports must be one of THIS
// request's snapshotted managers AND not have already voted — otherwise the
// buttons would sit there clickable and just 403/409 on click, which is
// exactly the kind of confusion this feature is meant to avoid.
function leaveDecisionAccess(r: LeaveRequest, hasPermission: (code: string) => boolean, myEmployeeId?: string | null) {
  if (r.status !== 'pending') return { canApprove: false, canReject: false };
  const hasAdminGrant = hasPermission('leave_request:approve') || hasPermission('leave_request:reject');
  if (hasAdminGrant) return { canApprove: hasPermission('leave_request:approve'), canReject: hasPermission('leave_request:reject') };

  const myStatus = myManagerApprovalStatus(r.managerApprovals, myEmployeeId);
  const isMyTurn = myStatus === 'pending';
  return {
    canApprove: isMyTurn && hasPermission('leave_request:approve_reports'),
    canReject: isMyTurn && hasPermission('leave_request:reject_reports'),
  };
}

export function TeamApprovalsPage() {
  const { hasPermission, user } = useAuth();
  // Lets the notification bell deep-link straight into a tab.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = (['leave', 'od', 'compOff'] as Tab[]).includes(requestedTab as Tab)
    ? (requestedTab as Tab)
    : 'leave';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [odRequests, setOdRequests] = useState<OdRequest[]>([]);
  const [compOffCredits, setCompOffCredits] = useState<CompOffCredit[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ tab: Tab; id: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ tab: Tab; id: string } | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAssignCompOff, setShowAssignCompOff] = useState(false);
  const canAssignCompOff = hasPermission('comp_off:credit');

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'compOff') {
        if (!canAssignCompOff) {
          setCompOffCredits([]);
          setTotal(0);
          return;
        }
        const result = await listCompOffCredits({ status: statusFilter || undefined, limit: LIMIT, offset });
        setCompOffCredits(result.data);
        setTotal(result.pagination.total);
        return;
      }

      const domain = activeTab === 'leave' ? 'leave_request' : 'od_request';
      const scope = resolveScope(hasPermission, domain);
      if (!scope) {
        if (activeTab === 'leave') setLeaveRequests([]);
        else setOdRequests([]);
        setTotal(0);
        return;
      }

      const params = { scope, status: statusFilter || undefined, limit: LIMIT, offset };
      if (activeTab === 'leave') {
        const result = await listLeaveRequests(params);
        setLeaveRequests(result.data);
        setTotal(result.pagination.total);
      } else {
        const result = await listOdRequests(params);
        setOdRequests(result.data);
        setTotal(result.pagination.total);
      }
    } catch {
      setError('Could not load your team’s requests.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, statusFilter, offset]);

  // Only needed to populate the "Assign Comp-Off" employee picker.
  useEffect(() => {
    if (activeTab === 'compOff' && canAssignCompOff && employees.length === 0) {
      listEmployees({ status: 'active', limit: 100 })
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

  async function confirmReject(reason: string) {
    if (!rejectTarget) return;
    const { tab, id } = rejectTarget;
    if (tab === 'leave') await rejectLeaveRequest(id, reason);
    else await rejectOdRequest(id, reason);
    setRejectTarget(null);
    load();
  }

  function loadHistory() {
    if (!historyTarget) return Promise.resolve([]);
    const { tab, id } = historyTarget;
    if (tab === 'leave') return getLeaveRequestHistory(id);
    if (tab === 'od') return getOdRequestHistory(id);
    return getCompOffHistory(id);
  }

  const rows = activeTab === 'leave' ? leaveRequests : activeTab === 'od' ? odRequests : compOffCredits;

  return (
    <div>
      <Tabs
        items={[
          { key: 'leave', label: 'Leave Requests' },
          { key: 'od', label: 'OD Requests' },
          ...(canAssignCompOff ? [{ key: 'compOff', label: 'Comp-Off Credits' }] : []),
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
          options={STATUS_OPTIONS}
        />
        {activeTab === 'compOff' && canAssignCompOff && (
          <Button type="button" onClick={() => setShowAssignCompOff(true)}>
            Assign Comp-Off
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyStateCard
          icon={Users}
          title={
            activeTab === 'leave' ? 'No leave requests' : activeTab === 'od' ? 'No OD requests' : 'No comp-off credits yet'
          }
          description={
            activeTab === 'compOff'
              ? 'Credits you assign to employees will show up here.'
              : 'Requests from employees who report to you will show up here.'
          }
        />
      )}

      {(isLoading || rows.length > 0) && activeTab === 'leave' && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={leaveRequests}
              rowKey={(r) => r.id}
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
                  key: 'managers',
                  header: 'Managers',
                  render: (r) =>
                    r.status === 'cancelled' ? (
                      '—'
                    ) : (
                      <ManagerApprovalStatus approvals={r.managerApprovals} decisionMode={r.decisionMode} />
                    ),
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-28 text-right',
                  render: (r) => {
                    const { canApprove, canReject } = leaveDecisionAccess(r, hasPermission, user?.employeeId);
                    return (
                      <ActionButtons
                        canApprove={canApprove}
                        canReject={canReject}
                        onApprove={() => handleLeaveApprove(r.id)}
                        onReject={() => setRejectTarget({ tab: 'leave', id: r.id })}
                        onHistory={() => setHistoryTarget({ tab: 'leave', id: r.id })}
                      />
                    );
                  },
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading &&
              leaveRequests.map((r) => {
                const { canApprove, canReject } = leaveDecisionAccess(r, hasPermission, user?.employeeId);
                return (
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
                      {
                        icon: Users,
                        label: 'Managers',
                        value:
                          r.status === 'cancelled' ? (
                            '—'
                          ) : (
                            <ManagerApprovalStatus approvals={r.managerApprovals} decisionMode={r.decisionMode} />
                          ),
                      },
                    ]}
                    canApprove={canApprove}
                    canReject={canReject}
                    onApprove={() => handleLeaveApprove(r.id)}
                    onReject={() => setRejectTarget({ tab: 'leave', id: r.id })}
                    onHistory={() => setHistoryTarget({ tab: 'leave', id: r.id })}
                  />
                );
              })}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {(isLoading || rows.length > 0) && activeTab === 'od' && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={odRequests}
              rowKey={(r) => r.id}
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
                      canApprove={
                        r.status === 'pending' &&
                        (hasPermission('od_request:approve') || hasPermission('od_request:approve_reports'))
                      }
                      canReject={
                        r.status === 'pending' &&
                        (hasPermission('od_request:reject') || hasPermission('od_request:reject_reports'))
                      }
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
                  canApprove={
                    r.status === 'pending' &&
                    (hasPermission('od_request:approve') || hasPermission('od_request:approve_reports'))
                  }
                  canReject={
                    r.status === 'pending' &&
                    (hasPermission('od_request:reject') || hasPermission('od_request:reject_reports'))
                  }
                  onApprove={() => handleOdApprove(r.id)}
                  onReject={() => setRejectTarget({ tab: 'od', id: r.id })}
                  onHistory={() => setHistoryTarget({ tab: 'od', id: r.id })}
                />
              ))}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {(isLoading || rows.length > 0) && activeTab === 'compOff' && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={compOffCredits}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'employee',
                  header: 'Employee',
                  render: (r) => <EmployeeCell employee={r.employee} employeeId={r.employeeId} />,
                },
                { key: 'earnedDate', header: 'Earned Date', render: (r) => formatDisplayDate(r.earnedDate) },
                {
                  key: 'expiryDate',
                  header: 'Expiry Date',
                  render: (r) => (r.expiryDate ? formatDisplayDate(r.expiryDate) : 'Never'),
                },
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
                      canApprove={false}
                      canReject={false}
                      onApprove={() => {}}
                      onReject={() => {}}
                      onHistory={() => setHistoryTarget({ tab: 'compOff', id: r.id })}
                    />
                  ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
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
                  canApprove={false}
                  canReject={false}
                  onApprove={() => {}}
                  onReject={() => {}}
                  onHistory={() => setHistoryTarget({ tab: 'compOff', id: r.id })}
                />
              ))}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {rejectTarget && (
        <RejectReasonModal title="Reject request" onClose={() => setRejectTarget(null)} onConfirm={confirmReject} />
      )}

      {historyTarget && (
        <ApprovalHistoryModal title="Approval history" onClose={() => setHistoryTarget(null)} load={loadHistory} />
      )}

      {showAssignCompOff && (
        <AssignCompOffModal employees={employees} onClose={() => setShowAssignCompOff(false)} onSaved={load} />
      )}
    </div>
  );
}
