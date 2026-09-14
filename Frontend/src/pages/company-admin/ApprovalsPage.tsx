import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bookmark, CalendarRange, CalendarX, Clock, FileText, Layers, MapPin, Tag, User } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { Pagination } from '../../components/ui/Pagination';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { RejectReasonModal } from '../../components/RejectReasonModal';
import { ApproveRegularizationModal } from '../../components/ApproveRegularizationModal';
import { ApprovalHistoryModal } from '../../components/ApprovalHistoryModal';
import { RequestCard, RequestCardSkeleton, RequestStatusBadge } from '../../components/RequestCard';
import { ManagerApprovalStatus } from '../../components/ManagerApprovalStatus';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
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
import { listBrands } from '../../api/companyAdmin/org';
import type { Brand, Employee } from '../../api/tenancy';
import { AssignCompOffModal } from './components/AssignCompOffModal';
import { formatDisplayDate, formatDisplayTime } from '../../utils/dateDisplay';

function formatRequestedTimes(r: AttendanceRegularization): string {
  if (!r.requestedCheckIn && !r.requestedCheckOut) return '—';
  return `${formatDisplayTime(r.requestedCheckIn)} → ${formatDisplayTime(r.requestedCheckOut)}`;
}

function employeeLabel(employee: RequestEmployee | undefined, employeeId: string) {
  return employee ? [employee.name, employee.employeeCode].filter(Boolean).join(' · ') : employeeId;
}

type Tab = 'leave' | 'od' | 'regularization' | 'compOff';

const LIMIT = 20;

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
  const confirm = useConfirm();
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
  const [brandFilter, setBrandFilter] = useState('');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [offset, setOffset] = useState(0);

  // Only Company Admin's own view gets to pick a Brand. Brand Admin's own
  // view already has one fixed by extraParams.brandId, and a second filter
  // on top of that would be redundant (and would leak sibling Brand names
  // into a portal that's deliberately hidden them everywhere else — see
  // OrganizationPage.tsx's Brands-tab removal). Group Admin's read-only
  // company drill-in (extraParams.companyId) is skipped too — listBrands()
  // below has no companyId override, so it can't resolve the drilled-into
  // company's own Brands from here.
  const showBrandFilter = !extraParams.brandId && !extraParams.companyId;

  useEffect(() => {
    if (!showBrandFilter) return;
    listBrands()
      .then(setBrands)
      .catch(() => {
        /* non-critical — the Brand filter just stays hidden */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const params = {
        status: statusFilter || undefined,
        brandId: showBrandFilter ? brandFilter || undefined : undefined,
        limit: LIMIT,
        offset,
        ...extraParams,
      };
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
  }, [activeTab, statusFilter, brandFilter, offset]);

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
    const confirmed = await confirm({
      title: 'Approve leave request',
      message: 'Approve this leave request?',
      confirmLabel: 'Approve',
      variant: 'primary',
    });
    if (!confirmed) return;
    await approveLeaveRequest(id);
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
    const confirmed = await confirm({
      title: 'Approve comp-off credit',
      message: 'Approve this comp-off credit?',
      confirmLabel: 'Approve',
      variant: 'primary',
    });
    if (!confirmed) return;
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
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
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
          {showBrandFilter && brands.length > 0 && (
            <FilterSelect
              value={brandFilter}
              onChange={(value) => {
                setOffset(0);
                setBrandFilter(value);
              }}
              placeholder="All brands"
              ariaLabel="Filter by brand"
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
            />
          )}
        </div>
        {activeTab === 'compOff' && hasPermission('comp_off:credit') && (
          <Button type="button" onClick={() => setShowAssignCompOff(true)}>
            Assign Comp-Off
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {activeTab === 'leave' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading && leaveRequests.length === 0 && (
              <div className="sm:col-span-2 xl:col-span-3">
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
                    {
                      icon: User,
                      label: 'Managers',
                      value:
                        r.status === 'cancelled' ? (
                          '—'
                        ) : (
                          <ManagerApprovalStatus approvals={r.managerApprovals} decisionMode={r.decisionMode} />
                        ),
                    },
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading && odRequests.length === 0 && (
              <div className="sm:col-span-2 xl:col-span-3">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading && regularizations.length === 0 && (
              <div className="sm:col-span-2 xl:col-span-3">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading && <RequestCardSkeleton />}
            {!isLoading && compOffCredits.length === 0 && (
              <div className="sm:col-span-2 xl:col-span-3">
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
