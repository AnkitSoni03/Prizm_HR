import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bookmark, Building2, CalendarRange, CalendarX, Clock, FileText, Layers, MapPin, Undo2, User, Users } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { RejectReasonModal } from '../../components/RejectReasonModal';
import { ApprovalHistoryModal } from '../../components/ApprovalHistoryModal';
import { RequestCard, RequestCardSkeleton, RequestStatusBadge } from '../../components/RequestCard';
import { ManagerApprovalStatus } from '../../components/ManagerApprovalStatus';
import { myManagerApprovalStatus } from '../../utils/managerApproval';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import {
  approveCompOffCredit,
  approveLeaveRequest,
  approveOdRequest,
  getCompOffHistory,
  getLeaveRequestHistory,
  getOdRequestHistory,
  listCompOffCredits,
  listLeaveRequests,
  listOdRequests,
  rejectCompOffCredit,
  rejectLeaveRequest,
  revokeCompOffCredit,
  revokeLeaveRequest,
  revokeOdRequest,
  rejectOdRequest,
  type CompOffCredit,
  type LeaveRequestManagerApproval,
  type LeaveRequest,
  type OdRequest,
  type RequestEmployee,
} from '../../api/companyAdmin/approvals';
import { listEmployees } from '../../api/companyAdmin/employees';
import type { Employee } from '../../api/tenancy';
import { AssignCompOffModal } from '../company-admin/components/AssignCompOffModal';
import { formatDisplayDate } from '../../utils/dateDisplay';
import { apiErrorMessage } from '../../utils/apiError';

function employeeLabel(employee: RequestEmployee | undefined, employeeId: string) {
  return employee ? [employee.name, employee.employeeCode].filter(Boolean).join(' · ') : employeeId;
}

// A manager's reports may sit in another Company/Brand of the Group — show
// where each one belongs.
function orgLabel(employee: RequestEmployee | undefined) {
  if (!employee?.company) return null;
  return [employee.company.name, employee.brand?.name].filter(Boolean).join(' › ');
}

function orgField(employee: RequestEmployee | undefined) {
  const label = orgLabel(employee);
  return label ? [{ icon: Building2, label: 'Company', value: label }] : [];
}

type Tab = 'leave' | 'od' | 'compOff';
type Scope = 'company' | 'reports';
type Domain = 'leave_request' | 'od_request' | 'comp_off';

const DOMAIN: Record<Tab, Domain> = { leave: 'leave_request', od: 'od_request', compOff: 'comp_off' };

const LIMIT = 20;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const SCOPE_OPTIONS = [
  { value: 'reports', label: 'My team' },
  { value: 'company', label: 'All employees' },
];

// Which views the caller can see on a tab, from the permissions they hold
// (the backend enforces the same rule either way):
//   - 'company': company/brand-wide `<domain>:read` (e.g. the "Approve
//     Leave/OD Requests" or "Assign Comp-Off" power).
//   - 'reports': `<domain>:read_reports` (granted to every Employee) — every
//     employee who has the caller as primary OR additional manager, in any
//     company of the Group. Empty for someone who manages nobody.
// Neither is ever sent by MyLeavePage/MyOdPage/MyCompOffPage's plain calls.
function availableScopes(hasPermission: (code: string) => boolean, domain: Domain): Scope[] {
  const scopes: Scope[] = [];
  if (hasPermission(`${domain}:read_reports`)) scopes.push('reports');
  if (hasPermission(`${domain}:read`)) scopes.push('company');
  return scopes;
}

// Approve/Reject buttons follow the multi-manager AND-gate, not just "is it
// still pending": a company-wide approver can always decide (bypasses the
// chain), but a manager must be one of THIS item's snapshotted managers AND
// not have voted yet — otherwise the buttons would just 403/409 on click.
function decisionAccess(
  isPending: boolean,
  approvals: LeaveRequestManagerApproval[] | undefined,
  domain: Domain,
  hasPermission: (code: string) => boolean,
  myEmployeeId?: string | null
) {
  if (!isPending) return { canApprove: false, canReject: false };
  const myStatus = myManagerApprovalStatus(approvals, myEmployeeId);
  if (myStatus === 'pending') {
    return {
      canApprove: hasPermission(`${domain}:approve_reports`) || hasPermission(`${domain}:approve`),
      canReject: hasPermission(`${domain}:reject_reports`) || hasPermission(`${domain}:reject`),
    };
  }
  return { canApprove: hasPermission(`${domain}:approve`), canReject: hasPermission(`${domain}:reject`) };
}

export function TeamApprovalsPage() {
  const { hasPermission, user } = useAuth();
  const confirm = useConfirm();
  // Lets the notification bell deep-link straight into a tab.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = (['leave', 'od', 'compOff'] as Tab[]).includes(requestedTab as Tab)
    ? (requestedTab as Tab)
    : 'leave';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const scopes = availableScopes(hasPermission, DOMAIN[activeTab]);
  const [scopeChoice, setScopeChoice] = useState<Scope | null>(null);
  const scope: Scope | null = scopeChoice && scopes.includes(scopeChoice) ? scopeChoice : (scopes[0] ?? null);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [odRequests, setOdRequests] = useState<OdRequest[]>([]);
  const [compOffCredits, setCompOffCredits] = useState<CompOffCredit[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ tab: Tab; id: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ tab: Tab; id: string } | null>(null);
  const [revertTarget, setRevertTarget] = useState<{ tab: 'leave' | 'od' | 'compOff'; id: string } | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAssignCompOff, setShowAssignCompOff] = useState(false);
  const canAssignCompOff = hasPermission('comp_off:credit');

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      if (!scope) {
        setLeaveRequests([]);
        setOdRequests([]);
        setCompOffCredits([]);
        setTotal(0);
        return;
      }

      const base = { status: statusFilter || undefined, limit: LIMIT, offset };
      if (activeTab === 'leave') {
        const result = await listLeaveRequests({ ...base, scope });
        setLeaveRequests(result.data);
        setTotal(result.pagination.total);
      } else if (activeTab === 'od') {
        const result = await listOdRequests({ ...base, scope });
        setOdRequests(result.data);
        setTotal(result.pagination.total);
      } else {
        // Its status filter uses 'pending_approval' for pending.
        const status = statusFilter === 'pending' ? 'pending_approval' : base.status;
        const result = await listCompOffCredits({
          ...base,
          status,
          scope,
        });
        setCompOffCredits(result.data);
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
  }, [activeTab, statusFilter, offset, scope]);

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
    setScopeChoice(null);
  }

  async function handleLeaveApprove(id: string) {
    const confirmed = await confirm({
      title: 'Approve leave request',
      message: 'Approve this leave request?',
      confirmLabel: 'Approve',
      variant: 'primary',
    });
    if (!confirmed) return;
    try {
      await approveLeaveRequest(id);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not approve this leave request.'));
      return;
    }
    load();
  }
  async function handleOdApprove(id: string) {
    const confirmed = await confirm({
      title: 'Approve OD request',
      message: 'Approve this on-duty request?',
      confirmLabel: 'Approve',
      variant: 'primary',
    });
    if (!confirmed) return;
    try {
      await approveOdRequest(id);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not approve this OD request.'));
      return;
    }
    load();
  }
  async function handleCompOffApprove(id: string) {
    const confirmed = await confirm({
      title: 'Approve comp-off credit',
      message: 'Approve this comp-off credit?',
      confirmLabel: 'Approve',
      variant: 'primary',
    });
    if (!confirmed) return;
    try {
      await approveCompOffCredit(id);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not approve this comp-off credit.'));
      return;
    }
    load();
  }

  async function confirmReject(reason: string) {
    if (!rejectTarget) return;
    const { tab, id } = rejectTarget;
    if (tab === 'leave') await rejectLeaveRequest(id, reason);
    else if (tab === 'od') await rejectOdRequest(id, reason);
    else await rejectCompOffCredit(id, reason);
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
          ...(availableScopes(hasPermission, 'comp_off').length > 0 ? [{ key: 'compOff', label: 'Comp-Off Credits' }] : []),
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
        {scopes.length > 1 && scope && (
          <FilterSelect
            value={scope}
            onChange={(value) => {
              setOffset(0);
              setScopeChoice(value as Scope);
            }}
            placeholder="View"
            ariaLabel="Whose requests to show"
            options={SCOPE_OPTIONS}
          />
        )}
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
            scope === 'company'
              ? 'Requests will show up here.'
              : 'Requests from employees you manage — in any company or brand of your group — will show up here.'
          }
        />
      )}

      {(isLoading || rows.length > 0) && activeTab === 'leave' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading &&
              leaveRequests.map((r) => {
                const { canApprove, canReject } = decisionAccess(
                  r.status === 'pending',
                  r.managerApprovals,
                  'leave_request',
                  hasPermission,
                  user?.employeeId
                );
                return (
                  <RequestCard
                    key={r.id}
                    name={employeeLabel(r.employee, r.employeeId)}
                    photoUrl={r.employee?.photoDownloadUrl}
                    tag={r.leaveType?.name}
                    status={r.status}
                    rejectionReason={r.status === 'revoked' ? r.revokeReason : r.rejectionReason}
                    fields={[
                      { icon: User, label: 'Employee', value: employeeLabel(r.employee, r.employeeId) },
                      ...orgField(r.employee),
                      { icon: Layers, label: 'Type', value: r.leaveType?.name ?? '—' },
                      { icon: CalendarRange, label: 'Dates', value: `${formatDisplayDate(r.fromDate)} – ${formatDisplayDate(r.toDate)}` },
                      {
                        icon: Clock,
                        label: 'Days',
                        value: r.halfDaySession
                          ? `${Number(r.days)} (${r.halfDaySession === 'first_half' ? 'First Half' : 'Second Half'})`
                          : r.days,
                      },
                      { icon: FileText, label: 'Reason', value: r.reason ?? '—' },
                      {
                        icon: Bookmark,
                        label: 'Status',
                        value: (
                          <RequestStatusBadge
                            status={r.status}
                            rejectionReason={r.status === 'revoked' ? r.revokeReason : r.rejectionReason}
                          />
                        ),
                      },
                      ...(r.status === 'revoked' ? [{ icon: Undo2, label: 'Revert Reason', value: r.revokeReason ?? '—' }] : []),
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
                    // Admin power only (company/brand-wide leave_request:approve) —
                    // a manager can't undo a finalized request.
                    canRevert={r.status === 'approved' && hasPermission('leave_request:approve')}
                    onRevert={() => setRevertTarget({ tab: 'leave', id: r.id })}
                  />
                );
              })}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {(isLoading || rows.length > 0) && activeTab === 'od' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading &&
              odRequests.map((r) => {
                const { canApprove, canReject } = decisionAccess(
                  r.status === 'pending',
                  r.managerApprovals,
                  'od_request',
                  hasPermission,
                  user?.employeeId
                );
                return (
                  <RequestCard
                    key={r.id}
                    name={employeeLabel(r.employee, r.employeeId)}
                    photoUrl={r.employee?.photoDownloadUrl}
                    tag={r.purpose}
                    status={r.status}
                    rejectionReason={r.status === 'revoked' ? r.revokeReason : r.rejectionReason}
                    fields={[
                      { icon: User, label: 'Employee', value: employeeLabel(r.employee, r.employeeId) },
                      ...orgField(r.employee),
                      { icon: CalendarRange, label: 'Dates', value: `${formatDisplayDate(r.fromDate)} – ${formatDisplayDate(r.toDate)}` },
                      { icon: FileText, label: 'Purpose', value: r.purpose },
                      { icon: MapPin, label: 'Location', value: r.location ?? '—' },
                      {
                        icon: Bookmark,
                        label: 'Status',
                        value: (
                          <RequestStatusBadge
                            status={r.status}
                            rejectionReason={r.status === 'revoked' ? r.revokeReason : r.rejectionReason}
                          />
                        ),
                      },
                      ...(r.status === 'revoked' ? [{ icon: Undo2, label: 'Revert Reason', value: r.revokeReason ?? '—' }] : []),
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
                    onApprove={() => handleOdApprove(r.id)}
                    onReject={() => setRejectTarget({ tab: 'od', id: r.id })}
                    onHistory={() => setHistoryTarget({ tab: 'od', id: r.id })}
                    // Admin power only — a manager can't undo a finalized request.
                    canRevert={r.status === 'approved' && hasPermission('od_request:approve')}
                    onRevert={() => setRevertTarget({ tab: 'od', id: r.id })}
                  />
                );
              })}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {(isLoading || rows.length > 0) && activeTab === 'compOff' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading &&
              compOffCredits.map((r) => {
                const { canApprove, canReject } = decisionAccess(
                  r.status === 'pending_approval',
                  r.managerApprovals,
                  'comp_off',
                  hasPermission,
                  user?.employeeId
                );
                return (
                  <RequestCard
                    key={r.id}
                    name={employeeLabel(r.employee, r.employeeId)}
                    photoUrl={r.employee?.photoDownloadUrl}
                    status={r.status}
                    rejectionReason={r.status === 'revoked' ? r.revokeReason : r.rejectionReason}
                    fields={[
                      { icon: User, label: 'Employee', value: employeeLabel(r.employee, r.employeeId) },
                      ...orgField(r.employee),
                      { icon: CalendarRange, label: 'Earned Date', value: formatDisplayDate(r.earnedDate) },
                      { icon: CalendarX, label: 'Expiry Date', value: r.expiryDate ? formatDisplayDate(r.expiryDate) : 'Never' },
                      {
                        icon: Bookmark,
                        label: 'Status',
                        value: (
                          <RequestStatusBadge
                            status={r.status}
                            rejectionReason={r.status === 'revoked' ? r.revokeReason : r.rejectionReason}
                          />
                        ),
                      },
                      ...(r.status === 'revoked' ? [{ icon: Undo2, label: 'Revert Reason', value: r.revokeReason ?? '—' }] : []),
                      ...((r.managerApprovals?.length ?? 0) > 0
                        ? [
                            {
                              icon: Users,
                              label: 'Managers',
                              value: <ManagerApprovalStatus approvals={r.managerApprovals} decisionMode={r.decisionMode} />,
                            },
                          ]
                        : []),
                    ]}
                    canApprove={canApprove}
                    canReject={canReject}
                    onApprove={() => handleCompOffApprove(r.id)}
                    onReject={() => setRejectTarget({ tab: 'compOff', id: r.id })}
                    onHistory={() => setHistoryTarget({ tab: 'compOff', id: r.id })}
                    // Admin power only — a manager can't undo a finalized credit.
                    canRevert={r.status === 'approved' && hasPermission('comp_off:approve')}
                    onRevert={() => setRevertTarget({ tab: 'compOff', id: r.id })}
                  />
                );
              })}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {revertTarget && (
        <RejectReasonModal
          title={
            revertTarget.tab === 'leave'
              ? 'Revert approved leave'
              : revertTarget.tab === 'od'
                ? 'Revert approved OD'
                : 'Revert comp-off credit'
          }
          reasonLabel="Reason for reverting"
          placeholder="Let the employee know why this approved request is being reverted"
          confirmLabel="Revert"
          errorMessage="Could not revert this request."
          onClose={() => setRevertTarget(null)}
          onConfirm={async (reason) => {
            if (revertTarget.tab === 'leave') await revokeLeaveRequest(revertTarget.id, reason);
            else if (revertTarget.tab === 'od') await revokeOdRequest(revertTarget.id, reason);
            else await revokeCompOffCredit(revertTarget.id, reason);
            setRevertTarget(null);
            load();
          }}
        />
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
