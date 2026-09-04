import { apiClient } from '../client';

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  // Whether an unused balance rolls into the next cycle at all.
  carryForward: boolean;
  // Cap on days carried forward when carryForward is true. null = unlimited
  // (carryForward: false is what means "zero", not this).
  maxCarryForwardDays: number | null;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allotted: number;
  used: number;
  balance: number;
  leaveType?: LeaveType;
  // The currently-governing accrual for this leave type, resolved from your
  // own Roster's Leave Policy — null only if you have no Roster (shouldn't
  // happen for a row that exists at all, since a balance can't be created
  // without one). See leaveBalance.service.js::attachAccrualInfo.
  accrual: 'yearly' | 'monthly' | 'monthly_reset' | null;
}

// One row per manager, snapshotted at submission time — see
// leave_request_approvals' header comment (Backend migration
// 20260905090100). 'bypassed' means an admin decided the whole request
// before this manager got to.
export interface LeaveRequestManagerApproval {
  id: string;
  managerEmployeeId: string;
  status: 'pending' | 'approved' | 'rejected' | 'bypassed';
  reason: string | null;
  decidedAt: string | null;
  manager?: { id: string; name: string | null; employeeCode: string | null } | null;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId: string | null;
  compOffCreditId: string | null;
  leaveType?: LeaveType;
  // Multi-manager AND-gate approval — who's approved, who's still pending,
  // for full transparency on this request's own status. 'manager_consensus'
  // once every row is 'approved'; 'admin_override' if a company/brand-wide
  // admin decided it directly instead.
  decisionMode?: 'manager_consensus' | 'admin_override' | null;
  managerApprovals?: LeaveRequestManagerApproval[];
}

export interface Holiday {
  id: string;
  brandId: string | null;
  date: string;
  // Inclusive end of the holiday's date range — equal to `date` for a
  // plain single-day holiday.
  endDate: string;
  name: string;
  type: 'public' | 'optional';
}

interface ListResult<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number };
}

// Reference data (leave types, holidays) plus everything scoped to the
// caller's own employeeId via leave_balance:read_own / leave_request:read_own
// — the backend resolves employeeId from the JWT, never passed from here.
//
// rosterGroupId, when passed, scopes the result to only leave types your own
// Roster actually grants ('none' if you have no Roster — see
// leaveType.service.js::listLeaveTypes). Omit it entirely (e.g. My Comp-Off's
// lookup of the system "CO" type by code) to get the full company catalog
// regardless of Roster — comp-off consumption isn't gated by a Leave Policy.
export async function listLeaveTypes(params: { rosterGroupId?: string } = {}): Promise<LeaveType[]> {
  const { data } = await apiClient.get<{ data: LeaveType[] }>('/leave/types', { params: { limit: 100, ...params } });
  return data.data;
}

export async function listMyLeaveBalances(params: { year?: number } = {}): Promise<LeaveBalance[]> {
  const { data } = await apiClient.get<{ data: LeaveBalance[] }>('/leave/balances', {
    params: { ...params, limit: 100 },
  });
  return data.data;
}

export async function listMyLeaveRequests(params: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ListResult<LeaveRequest>> {
  const { data } = await apiClient.get<ListResult<LeaveRequest>>('/leave/requests', { params });
  return data;
}

export async function createLeaveRequest(input: {
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  reason?: string;
}): Promise<LeaveRequest> {
  const { data } = await apiClient.post<{ data: LeaveRequest }>('/leave/requests', input);
  return data.data;
}

export async function cancelLeaveRequest(id: string): Promise<LeaveRequest> {
  const { data } = await apiClient.patch<{ data: LeaveRequest }>(`/leave/requests/${id}/cancel`);
  return data.data;
}

// rosterGroupId, when passed, scopes the result to only holidays your own
// Roster actually has ('none' if you have no Roster — see
// holiday.service.js::listHolidays). Roster is the sole determinant of what
// an employee sees; a holiday with zero Roster links is dormant, not a
// "company-wide" fallback.
export async function listHolidays(params: { from?: string; to?: string; rosterGroupId?: string } = {}): Promise<Holiday[]> {
  const { data } = await apiClient.get<{ data: Holiday[] }>('/leave/holidays', {
    params: { ...params, limit: 100 },
  });
  return data.data;
}
