import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, History, Users, X } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { RejectReasonModal } from '../../components/RejectReasonModal';
import { ApprovalHistoryModal } from '../../components/ApprovalHistoryModal';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../context/auth-context';
import {
  approveLeaveRequest,
  approveOdRequest,
  getLeaveRequestHistory,
  getOdRequestHistory,
  listLeaveRequests,
  listOdRequests,
  rejectLeaveRequest,
  rejectOdRequest,
  type LeaveRequest,
  type OdRequest,
  type RequestEmployee,
} from '../../api/companyAdmin/approvals';
import { formatDisplayDate } from '../../utils/dateDisplay';

function EmployeeCell({ employee, employeeId }: { employee?: RequestEmployee; employeeId: string }) {
  const label = employee ? [employee.name, employee.employeeCode].filter(Boolean).join(' · ') : employeeId;
  return (
    <div className="flex items-center gap-2.5">
      <Avatar src={employee?.photoDownloadUrl} size="sm" />
      <span>{label}</span>
    </div>
  );
}

type Tab = 'leave' | 'od';

const LIMIT = 20;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
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

export function TeamApprovalsPage() {
  const { hasPermission } = useAuth();
  // Lets the notification bell deep-link straight into a tab.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = requestedTab === 'od' ? 'od' : 'leave';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [offset, setOffset] = useState(0);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [odRequests, setOdRequests] = useState<OdRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ tab: Tab; id: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ tab: Tab; id: string } | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
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

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setStatusFilter('pending');
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
    return tab === 'leave' ? getLeaveRequestHistory(id) : getOdRequestHistory(id);
  }

  const rows = activeTab === 'leave' ? leaveRequests : odRequests;

  return (
    <div>
      <Tabs
        items={[
          { key: 'leave', label: 'Leave Requests' },
          { key: 'od', label: 'OD Requests' },
        ]}
        active={activeTab}
        onChange={(key) => switchTab(key as Tab)}
      />

      <div className="mb-3 w-full sm:w-48">
        <Select
          id="team-approvals-status-filter"
          label="Status"
          value={statusFilter}
          onChange={(event) => {
            setOffset(0);
            setStatusFilter(event.target.value);
          }}
          options={STATUS_OPTIONS}
        />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyStateCard
          icon={Users}
          title={activeTab === 'leave' ? 'No leave requests' : 'No OD requests'}
          description="Requests from employees who report to you will show up here."
        />
      )}

      {(isLoading || rows.length > 0) && activeTab === 'leave' && (
        <>
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
                    canApprove={
                      r.status === 'pending' &&
                      (hasPermission('leave_request:approve') || hasPermission('leave_request:approve_reports'))
                    }
                    canReject={
                      r.status === 'pending' &&
                      (hasPermission('leave_request:reject') || hasPermission('leave_request:reject_reports'))
                    }
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

      {(isLoading || rows.length > 0) && activeTab === 'od' && (
        <>
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
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {rejectTarget && (
        <RejectReasonModal title="Reject request" onClose={() => setRejectTarget(null)} onConfirm={confirmReject} />
      )}

      {historyTarget && (
        <ApprovalHistoryModal title="Approval history" onClose={() => setHistoryTarget(null)} load={loadHistory} />
      )}
    </div>
  );
}
