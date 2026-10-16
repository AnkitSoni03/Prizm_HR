import { apiClient } from '../client';
import type { LeaveType } from './leaveBalance';
import type { RosterPolicyGroup } from './rosterGroups';

export interface LeavePolicy {
  id: string;
  companyId: string;
  // NULL = shared across every Brand in the company.
  brandId: string | null;
  leaveTypeId: string;
  // Empty = the company-wide default for this leave type; one or more = an
  // override that only applies to those Rosters' employees (see
  // leaveBalance.service.js::resolveLeavePolicy on the backend). A leave
  // type may have at most one company-wide default plus at most one override
  // per Roster — enforced server-side, not here.
  rosterGroups?: RosterPolicyGroup[];
  annualQuota: number;
  // Unlimited quota — annualQuota is ignored (0) and no balance limit applies.
  isUnlimited: boolean;
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
  params: { leaveTypeId?: string; rosterGroupId?: string | null; brandId?: string } = {}
): Promise<LeavePolicy[]> {
  const { data } = await apiClient.get<LeavePolicyListResult>('/leave/policies', {
    params: {
      limit: 100,
      leaveTypeId: params.leaveTypeId,
      rosterGroupId: params.rosterGroupId === null ? 'null' : params.rosterGroupId,
      brandId: params.brandId,
    },
  });
  return data.data;
}

export async function createLeavePolicy(input: {
  leaveTypeId: string;
  rosterGroupIds?: string[];
  annualQuota: number;
  isUnlimited?: boolean;
  accrual?: 'yearly' | 'monthly' | 'monthly_reset';
  applicableAfterDays?: number;
  // Omit (or '') for a Leave Policy shared across every Brand — see
  // utils/brandScope.js.
  brandId?: string;
}): Promise<LeavePolicy> {
  const { data } = await apiClient.post<{ data: LeavePolicy }>('/leave/policies', input);
  return data.data;
}

export async function updateLeavePolicy(
  id: string,
  input: Partial<{
    annualQuota: number;
    isUnlimited: boolean;
    accrual: 'yearly' | 'monthly' | 'monthly_reset';
    applicableAfterDays: number;
    rosterGroupIds: string[];
    brandId: string;
  }>
): Promise<LeavePolicy> {
  const { data } = await apiClient.patch<{ data: LeavePolicy }>(`/leave/policies/${id}`, input);
  return data.data;
}

// Display text for a policy's quota column/row.
export function formatPolicyQuota(policy: LeavePolicy): string {
  if (policy.leaveType?.deductFromLeaveTypeId) {
    return `${Number(policy.leaveType.deductionPerUse) || 1} day per use (linked)`;
  }
  if (policy.isUnlimited) return 'Unlimited';
  return `${Number(policy.annualQuota)} days`;
}

// Company default "Yearly Roster Update": the month (1-12) the yearly leave
// cycle starts on (1 = Jan–Dec, 4 = Apr–Mar). Balances renew on the 1st of
// that month with capped carry-forward — never during a Probation/Intern
// period. Employees can override it on their profile.
export async function getYearlyCycle(): Promise<{ yearlyCycleStartMonth: number }> {
  const { data } = await apiClient.get<{ data: { yearlyCycleStartMonth: number } }>('/leave/policies/yearly-cycle');
  return data.data;
}

export async function updateYearlyCycle(yearlyCycleStartMonth: number): Promise<{ yearlyCycleStartMonth: number }> {
  const { data } = await apiClient.put<{ data: { yearlyCycleStartMonth: number } }>('/leave/policies/yearly-cycle', {
    yearlyCycleStartMonth,
  });
  return data.data;
}
