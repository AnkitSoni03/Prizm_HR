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
  // System-generated "Week Off Leaves" bucket (see
  // weekOffLeave.service.js::ensureWeekOffLeaveType) — MyLeavePage.tsx uses
  // this to keep an employee's own weekOffLeaveBlockedDays un-pickable in
  // the date fields when this type is selected.
  isWeekOffBucket?: boolean;
  // Optional "Deduct from another leave" link — when set, this type has no
  // balance of its own; each use (one date) charges deductionPerUse (0.5 or
  // 1) day to the source type's balance. 0.5 = a half-day leave.
  deductFromLeaveTypeId?: string | null;
  deductionPerUse?: number | string | null;
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
  // The governing policy's quota is Unlimited — no balance limit applies.
  isUnlimited?: boolean;
  // Set on a synthesized row for a linked type (e.g. Half Day): its numbers
  // are the source type's balance expressed in uses of this type.
  linkedTo?: { leaveTypeId: string; name: string | null; deductionPerUse: number } | null;
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
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'revoked';
  approverId: string | null;
  rejectionReason?: string | null;
  // Set when an admin reverted this leave after approval.
  revokeReason?: string | null;
  compOffCreditId: string | null;
  // Set only for a half-day leave.
  halfDaySession?: 'first_half' | 'second_half' | null;
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
  halfDaySession?: 'first_half' | 'second_half';
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

export const HALF_DAY_SESSION_LABELS: Record<'first_half' | 'second_half', string> = {
  first_half: 'First Half',
  second_half: 'Second Half',
};

// A linked type at 0.5 per use is a half-day leave — the request then needs
// a First/Second Half session.
export function isHalfDayLeaveType(leaveType?: Pick<LeaveType, 'deductFromLeaveTypeId' | 'deductionPerUse'> | null): boolean {
  return !!leaveType?.deductFromLeaveTypeId && Number(leaveType.deductionPerUse) === 0.5;
}
