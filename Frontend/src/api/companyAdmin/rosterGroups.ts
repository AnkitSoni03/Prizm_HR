import { apiClient } from '../client';
import type { Shift } from '../tenancy';
import type { Holiday } from './holidays';
import type { LeavePolicy } from './leavePolicies';
import type { CompanyPolicy } from './companyPolicies';

// Named RosterPolicyGroup, not RosterGroup — utils/rosterGrouping.ts already
// exports an unrelated `RosterGroup` interface (pure UI grouping of per-date
// shift_rosters rows). Keep this name distinct so the two are never confused
// or edited by mistake while grepping.
//
// A Roster no longer carries its own shiftId — Shifts/Holidays/Company
// Policies/Leave Policies are all assigned FROM those entities' own
// create/edit forms ("Assign to Roster(s)"), not from the Roster's form.
// This lightweight shape (id/name/description) is what the list endpoint
// returns and what RosterMultiSelect consumes; the full linked-entity detail
// only comes back from getRosterGroup.
export interface RosterPolicyGroup {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  // Optional validity period ("6 months", "45 days") — both null means no
  // expiry. Anchored per-employee at assignment time, not to the Roster
  // itself — see Employee.rosterAssignedAt and utils/rosterValidity.ts.
  validityValue: number | null;
  validityUnit: 'days' | 'months' | null;
  createdAt: string;
  updatedAt: string;
}

// Read-only summary of everything currently assigned to this Roster —
// populated by the backend's LINKED_ENTITY_INCLUDES, used by
// RosterGroupDetailModal's summary tabs.
export interface RosterPolicyGroupDetail extends RosterPolicyGroup {
  shifts: Shift[];
  holidays: Holiday[];
  companyPolicies: CompanyPolicy[];
  leavePolicies: LeavePolicy[];
}

export interface RosterGroupListResult {
  data: RosterPolicyGroup[];
  pagination: { total: number; limit: number; offset: number };
}

export interface RosterGroupAssignResult {
  employeeId: string;
  status: 'assigned' | 'skipped';
  reason?: string;
}

export async function listRosterGroups(): Promise<RosterPolicyGroup[]> {
  const { data } = await apiClient.get<RosterGroupListResult>('/roster-groups', { params: { limit: 100 } });
  return data.data;
}

export async function getRosterGroup(id: string): Promise<RosterPolicyGroupDetail> {
  const { data } = await apiClient.get<{ data: RosterPolicyGroupDetail }>(`/roster-groups/${id}`);
  return data.data;
}

export async function createRosterGroup(input: {
  name: string;
  description?: string | null;
  validityValue?: number | null;
  validityUnit?: 'days' | 'months' | null;
}): Promise<RosterPolicyGroup> {
  const { data } = await apiClient.post<{ data: RosterPolicyGroup }>('/roster-groups', input);
  return data.data;
}

export async function updateRosterGroup(
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    validityValue: number | null;
    validityUnit: 'days' | 'months' | null;
  }>
): Promise<RosterPolicyGroup> {
  const { data } = await apiClient.patch<{ data: RosterPolicyGroup }>(`/roster-groups/${id}`, input);
  return data.data;
}

export async function deleteRosterGroup(id: string): Promise<void> {
  await apiClient.delete(`/roster-groups/${id}`);
}

// Assigns this Roster to several employees in one call — the actual point
// of the feature (avoid re-configuring shift/holidays/leave-policy per
// employee one at a time). Per-employee failures come back as 'skipped'
// rows rather than failing the whole batch.
export async function bulkAssignRosterGroup(
  id: string,
  employeeIds: string[]
): Promise<RosterGroupAssignResult[]> {
  const { data } = await apiClient.post<{ data: RosterGroupAssignResult[] }>(`/roster-groups/${id}/assign`, {
    employeeIds,
  });
  return data.data;
}
