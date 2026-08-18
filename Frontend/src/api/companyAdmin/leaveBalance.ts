import { apiClient } from '../client';

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  // Whether an unused balance rolls into the next cycle at all — see
  // maxCarryForwardDays/cycleType below for how much and when.
  carryForward: boolean;
  // Cap on days carried forward when carryForward is true. null = unlimited
  // (carryForward: false is what means "zero", not this).
  maxCarryForwardDays: number | null;
  // 'calendar' (Jan 1 – Dec 31) or 'anniversary' (resets on the employee's
  // own joining-date anniversary).
  cycleType: 'calendar' | 'anniversary';
  // Pure UX default that pre-fills the Add Leave Policy form's Accrual
  // field when this type is selected — never enforced, a Roster-specific
  // policy can still pick a different accrual for the same leave type.
  defaultAccrual: 'yearly' | 'monthly' | 'monthly_reset' | null;
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
}

export async function listLeaveTypes(): Promise<LeaveType[]> {
  const { data } = await apiClient.get<{ data: LeaveType[] }>('/leave/types', { params: { limit: 100 } });
  return data.data;
}

interface LeaveTypeWriteInput {
  code: string;
  name: string;
  isPaid?: boolean;
  carryForward?: boolean;
  maxCarryForwardDays?: number | null;
  cycleType?: 'calendar' | 'anniversary';
  defaultAccrual?: 'yearly' | 'monthly' | 'monthly_reset' | null;
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
export async function deleteLeaveType(id: string): Promise<void> {
  await apiClient.delete(`/leave/types/${id}`);
}

export async function listLeaveBalances(params: { employeeId: string; year: number }): Promise<LeaveBalance[]> {
  const { data } = await apiClient.get<{ data: LeaveBalance[] }>('/leave/balances', {
    params: { ...params, limit: 100 },
  });
  return data.data;
}

// Sets `allotted` directly (not a delta) — gated by leave_balance:adjust.
// No frontend surface calls this anymore (manual balance adjustment was
// retired in favor of Roster-driven Leave Policies, see
// leaveBalance.service.js::resolveLeavePolicy); kept as a thin wrapper over
// the still-live backend endpoint in case a future admin tool needs it.
export async function adjustLeaveBalance(input: {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allotted: number;
}): Promise<LeaveBalance> {
  const { data } = await apiClient.post<{ data: LeaveBalance }>('/leave/balances/adjust', input);
  return data.data;
}
