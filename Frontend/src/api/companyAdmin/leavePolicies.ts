import { apiClient } from '../client';
import type { LeaveType } from './leaveBalance';
import type { RosterPolicyGroup } from './rosterGroups';

export interface LeavePolicy {
  id: string;
  companyId: string;
  leaveTypeId: string;
  // Empty = the company-wide default for this leave type; one or more = an
  // override that only applies to those Rosters' employees (see
  // leaveBalance.service.js::resolveLeavePolicy on the backend). A leave
  // type may have at most one company-wide default plus at most one override
  // per Roster — enforced server-side, not here.
  rosterGroups?: RosterPolicyGroup[];
  annualQuota: number;
  accrual: 'yearly' | 'monthly' | 'monthly_reset';
  applicableAfterDays: number;
  leaveType?: LeaveType;
}

export interface LeavePolicyListResult {
  data: LeavePolicy[];
  pagination: { total: number; limit: number; offset: number };
}

// rosterGroupId omitted = every policy (defaults + overrides); 'null' =
// company-wide defaults only; a real id = just that Roster Group's overrides.
export async function listLeavePolicies(
  params: { leaveTypeId?: string; rosterGroupId?: string | null } = {}
): Promise<LeavePolicy[]> {
  const { data } = await apiClient.get<LeavePolicyListResult>('/leave/policies', {
    params: {
      limit: 100,
      leaveTypeId: params.leaveTypeId,
      rosterGroupId: params.rosterGroupId === null ? 'null' : params.rosterGroupId,
    },
  });
  return data.data;
}

export async function createLeavePolicy(input: {
  leaveTypeId: string;
  rosterGroupIds?: string[];
  annualQuota: number;
  accrual?: 'yearly' | 'monthly' | 'monthly_reset';
  applicableAfterDays?: number;
}): Promise<LeavePolicy> {
  const { data } = await apiClient.post<{ data: LeavePolicy }>('/leave/policies', input);
  return data.data;
}

export async function updateLeavePolicy(
  id: string,
  input: Partial<{
    annualQuota: number;
    accrual: 'yearly' | 'monthly' | 'monthly_reset';
    applicableAfterDays: number;
    rosterGroupIds: string[];
  }>
): Promise<LeavePolicy> {
  const { data } = await apiClient.patch<{ data: LeavePolicy }>(`/leave/policies/${id}`, input);
  return data.data;
}
