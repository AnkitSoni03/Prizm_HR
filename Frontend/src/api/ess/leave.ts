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
}

export interface Holiday {
  id: string;
  brandId: string | null;
  date: string;
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
export async function listLeaveTypes(): Promise<LeaveType[]> {
  const { data } = await apiClient.get<{ data: LeaveType[] }>('/leave/types', { params: { limit: 100 } });
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

export async function listHolidays(params: { from?: string; to?: string } = {}): Promise<Holiday[]> {
  const { data } = await apiClient.get<{ data: Holiday[] }>('/leave/holidays', {
    params: { ...params, limit: 100 },
  });
  return data.data;
}
