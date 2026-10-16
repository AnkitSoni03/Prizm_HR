import { apiClient } from '../client';

export interface LeaveType {
  id: string;
  // NULL = shared across every Brand in the company.
  brandId?: string | null;
  code: string;
  name: string;
  isPaid: boolean;
  // Whether an unused balance rolls into the next period at all (the yearly
  // renewal — company/employee "Yearly Roster Update" — or Probation →
  // Full-time), capped by maxCarryForwardDays.
  carryForward: boolean;
  // Cap on days carried forward when carryForward is true. null = unlimited
  // (carryForward: false is what means "zero", not this).
  maxCarryForwardDays: number | null;
  // Pure UX default that pre-fills the Add Leave Policy form's Accrual
  // field when this type is selected — never enforced, a Roster-specific
  // policy can still pick a different accrual for the same leave type.
  defaultAccrual: 'yearly' | 'monthly' | 'monthly_reset' | null;
  // 'all' (default, every employee) or a restriction to one gender (e.g.
  // Maternity Leave -> 'female', Paternity Leave -> 'male'). Enforced
  // against the applying employee's own Employee.gender.
  applicableGender: 'all' | 'male' | 'female' | 'other';
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
  month: number | null;
  // The period this row covers: a yearly cycle (from the first day the
  // employee was in it), a Probation/Intern period (periodEnd null while it
  // is still running), or one calendar month for a monthly-reset type.
  periodStart: string;
  periodEnd: string | null;
  // Part of `allotted` carried in from the previous period.
  carriedForward: number | string;
  allotted: number;
  used: number;
  balance: number;
  leaveType?: LeaveType;
}

export async function listLeaveTypes(params: { brandId?: string } = {}): Promise<LeaveType[]> {
  const { data } = await apiClient.get<{ data: LeaveType[] }>('/leave/types', { params: { limit: 100, ...params } });
  return data.data;
}

interface LeaveTypeWriteInput {
  code: string;
  name: string;
  isPaid?: boolean;
  carryForward?: boolean;
  maxCarryForwardDays?: number | null;
  // Omit (or '') for a Leave Type shared across every Brand — see
  // utils/brandScope.js.
  brandId?: string;
  defaultAccrual?: 'yearly' | 'monthly' | 'monthly_reset' | null;
  applicableGender?: 'all' | 'male' | 'female' | 'other';
  // null/'' = independent type with its own quota.
  deductFromLeaveTypeId?: string | null;
  deductionPerUse?: number | null;
}

export async function createLeaveType(input: LeaveTypeWriteInput): Promise<LeaveType> {
  const { data } = await apiClient.post<{ data: LeaveType }>('/leave/types', input);
  return data.data;
}

export async function updateLeaveType(
  id: string,
  input: Partial<Omit<LeaveTypeWriteInput, 'code'>>
): Promise<LeaveType> {
  const { data } = await apiClient.patch<{ data: LeaveType }>(`/leave/types/${id}`, input);
  return data.data;
}

// Blocked (409) once a leave balance or request already exists for this
// type — that's real history, never destroyed. Safe otherwise: any Leave
// Policy config for it is necessarily unused too and is cleaned up
// automatically server-side (see leaveType.service.js::deleteLeaveType).
// `force: true` overrides the block — the blocking balance/request rows are
// soft-deleted along with the leave type, permanently losing that history
// from every normal view.
export async function deleteLeaveType(id: string, force = false): Promise<void> {
  await apiClient.delete(`/leave/types/${id}`, { params: force ? { force: true } : undefined });
}

export async function listLeaveBalances(params: { employeeId: string; year: number }): Promise<LeaveBalance[]> {
  const { data } = await apiClient.get<{ data: LeaveBalance[] }>('/leave/balances', {
    params: { ...params, limit: 100 },
  });
  return data.data;
}

// Sets `allotted` directly (not a delta) — gated by leave_balance:adjust.
// Superseded as the primary write path by bulkAdjustLeaveBalances below (the
// Employee Detail Modal's "Leaves" tab); kept as a thin wrapper over the
// still-live backend endpoint in case a single-row caller needs it.
export async function adjustLeaveBalance(input: {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allotted: number;
}): Promise<LeaveBalance> {
  const { data } = await apiClient.post<{ data: LeaveBalance }>('/leave/balances/adjust', input);
  return data.data;
}

// Edits several of one employee's leave types' allotted balance in a single
// Save (the Employee Detail Modal's "Leaves" tab) — each entry carries the
// row's own id (a year can hold two periods for one leave type: probation,
// then the post-confirmation period) plus its year/month (see
// leaveBalance.service.js::bulkAdjustLeaveBalances for why month matters for
// a 'monthly_reset' leave type). The employee gets one consolidated
// notification server-side, only if at least one entry's value actually
// changed. Returns how many rows actually changed.
export async function bulkAdjustLeaveBalances(input: {
  employeeId: string;
  adjustments: Array<{ id?: string; leaveTypeId: string; year: number; month: number | null; allotted: number; used?: number }>;
}): Promise<{ changed: number }> {
  const { data } = await apiClient.post<{ changed: number }>('/leave/balances/bulk-adjust', input);
  return data;
}
