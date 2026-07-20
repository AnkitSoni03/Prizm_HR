import { apiClient } from '../client';

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  carryForward: boolean;
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

export async function listLeaveBalances(params: { employeeId: string; year: number }): Promise<LeaveBalance[]> {
  const { data } = await apiClient.get<{ data: LeaveBalance[] }>('/leave/balances', {
    params: { ...params, limit: 100 },
  });
  return data.data;
}

// Sets `allotted` directly (not a delta) — gated by leave_balance:adjust,
// held by Company Admin and the auto-granted HR Team role.
export async function adjustLeaveBalance(input: {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allotted: number;
}): Promise<LeaveBalance> {
  const { data } = await apiClient.post<{ data: LeaveBalance }>('/leave/balances/adjust', input);
  return data.data;
}
