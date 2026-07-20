import { apiClient } from '../client';

export interface GroupDashboardSummary {
  companyCount: number;
  employeeCount: number;
  pendingLeaveRequests: number;
  pendingOdRequests: number;
  pendingRegularizations: number;
}

export async function getGroupDashboardSummary(): Promise<GroupDashboardSummary> {
  const { data } = await apiClient.get<{ data: GroupDashboardSummary }>('/dashboard/group-summary');
  return data.data;
}
