import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, History, X } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Pagination } from '../../components/ui/Pagination';
import { RejectReasonModal } from '../../components/RejectReasonModal';
import { ApprovalHistoryModal } from '../../components/ApprovalHistoryModal';
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
} from '../../api/companyAdmin/approvals';
import { formatDisplayDate } from '../../utils/dateDisplay';

type Tab = 'leave' | 'od' | 'regularization' | 'compOff';

const LIMIT = 20;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
  used: 'neutral',
};

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
  const [statusFilter, setStatusFilter] = useState(initialTab === 'compOff' ? 'pending_approval' : 'pending');
  const [offset, setOffset] = useState(0);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [odRequests, setOdRequests] = useState<OdRequest[]>([]);
  const [regularizations, setRegularizations] = useState<AttendanceRegularization[]>([]);
  const [compOffCredits, setCompOffCredits] = useState<CompOffCredit[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ tab: Tab; id: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ tab: Tab; id: string } | null>(null);

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

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setStatusFilter(tab === 'compOff' ? 'pending_approval' : 'pending');
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
  async function handleRegularizationApprove(id: string) {
    await approveRegularization(id);
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

      <div className="mb-3 w-full sm:w-48">
        <Select
          id="approvals-status-filter"
          label="Status"
          value={statusFilter}
          onChange={(event) => {
            setOffset(0);
            setStatusFilter(event.target.value);
          }}
          options={statusOptions}
        />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {activeTab === 'leave' && (
        <>
          <Table
            isLoading={isLoading}
            rows={leaveRequests}
            rowKey={(r) => r.id}
            emptyMessage="No leave requests found."
            columns={[
              { key: 'employee', header: 'Employee', render: (r) => r.employee?.employeeCode ?? r.employeeId },
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
                render: (r) => (
                  <Badge tone={STATUS_TONE[r.status]} title={r.status === 'rejected' ? r.rejectionReason ?? undefined : undefined}>
                    {r.status}
                  </Badge>
                ),
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
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {activeTab === 'od' && (
        <>
          <Table
            isLoading={isLoading}
            rows={odRequests}
            rowKey={(r) => r.id}
            emptyMessage="No OD requests found."
            columns={[
              { key: 'employee', header: 'Employee', render: (r) => r.employee?.employeeCode ?? r.employeeId },
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
                render: (r) => (
                  <Badge tone={STATUS_TONE[r.status]} title={r.status === 'rejected' ? r.rejectionReason ?? undefined : undefined}>
                    {r.status}
                  </Badge>
                ),
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
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {activeTab === 'regularization' && (
        <>
          <Table
            isLoading={isLoading}
            rows={regularizations}
            rowKey={(r) => r.id}
            emptyMessage="No regularization requests found."
            columns={[
              { key: 'employee', header: 'Employee', render: (r) => r.employee?.employeeCode ?? r.employeeId },
              { key: 'date', header: 'Date', render: (r) => formatDisplayDate(r.attendance?.date) },
              { key: 'requestedStatus', header: 'Requested Status', render: (r) => r.requestedStatus },
              { key: 'reason', header: 'Reason', render: (r) => r.reason },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <Badge tone={STATUS_TONE[r.status]} title={r.status === 'rejected' ? r.rejectionReason ?? undefined : undefined}>
                    {r.status}
                  </Badge>
                ),
              },
              {
                key: 'actions',
                header: '',
                className: 'w-28 text-right',
                render: (r) => (
                  <ActionButtons
                    canApprove={r.status === 'pending' && hasPermission('attendance_regularization:approve')}
                    canReject={r.status === 'pending' && hasPermission('attendance_regularization:reject')}
                    onApprove={() => handleRegularizationApprove(r.id)}
                    onReject={() => setRejectTarget({ tab: 'regularization', id: r.id })}
                    onHistory={() => setHistoryTarget({ tab: 'regularization', id: r.id })}
                  />
                ),
              },
            ]}
          />
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {activeTab === 'compOff' && (
        <>
          <Table
            isLoading={isLoading}
            rows={compOffCredits}
            rowKey={(r) => r.id}
            emptyMessage="No comp-off credits found."
            columns={[
              { key: 'employee', header: 'Employee', render: (r) => r.employee?.employeeCode ?? r.employeeId },
              { key: 'earnedDate', header: 'Earned Date', render: (r) => formatDisplayDate(r.earnedDate) },
              { key: 'expiryDate', header: 'Expiry Date', render: (r) => formatDisplayDate(r.expiryDate) },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <Badge tone={STATUS_TONE[r.status]} title={r.status === 'rejected' ? r.rejectionReason ?? undefined : undefined}>
                    {r.status.replace('_', ' ')}
                  </Badge>
                ),
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

      {historyTarget && (
        <ApprovalHistoryModal
          title="Approval history"
          onClose={() => setHistoryTarget(null)}
          load={loadHistory}
        />
      )}
    </div>
  );
}
