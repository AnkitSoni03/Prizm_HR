import { apiClient } from '../client';

export interface DepartmentHeadcount {
  name: string;
  count: number;
}

export interface EmployeeTrendPoint {
  month: string;
  joined: number;
  exited: number;
}

export interface LeaveBreakdownEntry {
  name: string;
  days: number;
}

export interface DashboardSummary {
  brandCount: number;
  employeeCount: number;
  pendingLeaveRequests: number;
  pendingOdRequests: number;
  pendingRegularizations: number;
  pendingCompOffCredits: number;
  departmentHeadcount: DepartmentHeadcount[];
  employeeTrend: EmployeeTrendPoint[];
  leaveBreakdown: LeaveBreakdownEntry[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await apiClient.get<{ data: DashboardSummary }>('/dashboard/summary');
  return data.data;
}
