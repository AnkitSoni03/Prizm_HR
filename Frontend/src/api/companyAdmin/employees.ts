import { apiClient } from '../client';
import type { Employee, InviteResult } from '../tenancy';

export interface EmployeeListParams {
  // Unused by Company Admin/Brand Admin's own listing (their scope is
  // resolved server-side from the JWT) — set by the Group Admin portal's
  // read-only company drill-in. See employee.controller.js's list handler.
  companyId?: string;
  brandId?: string;
  departmentId?: string;
  rosterGroupId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface EmployeeListResult {
  data: Employee[];
  pagination: { total: number; limit: number; offset: number };
}

export async function listEmployees(params: EmployeeListParams = {}): Promise<EmployeeListResult> {
  const { data } = await apiClient.get<EmployeeListResult>('/employees', { params });
  return data;
}

export async function getEmployee(id: string): Promise<Employee> {
  const { data } = await apiClient.get<{ data: Employee }>(`/employees/${id}`);
  return data.data;
}

export async function createEmployee(input: {
  name: string;
  employeeCode: string;
  brandId?: string;
  departmentId: string;
  designationId: string | null;
  managerId: string | null;
  rosterGroupId?: string | null;
  dateOfJoining: string;
  dateOfBirth?: string;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'probation';
  workState?: string;
}): Promise<Employee> {
  const { data } = await apiClient.post<{ data: Employee }>('/employees', input);
  return data.data;
}

export async function updateEmployee(
  id: string,
  input: Partial<{
    employeeCode: string | null;
    designationId: string | null;
    employmentType: 'full_time' | 'part_time' | 'contract' | 'probation';
    status: Employee['status'];
    dateOfJoining: string | null;
    dateOfBirth: string | null;
    managerId: string | null;
    workState: string | null;
  }>
): Promise<Employee> {
  const { data } = await apiClient.patch<{ data: Employee }>(`/employees/${id}`, input);
  return data.data;
}

// Per-leave-type breakdown of what a Roster change did to this employee's
// existing balances — see Backend/src/modules/org/rosterTransfer.service.js.
export interface RosterTransferDetail {
  leaveTypeId: string;
  leaveTypeName: string;
  action: 'kept' | 'reset' | 'moved_to_carry_forward' | 'capped_to_zero';
  previousBalance?: number;
  newAllotted?: number;
  matchedInNewRoster?: boolean;
  balance?: number;
  carryForwardAmount?: number;
  carryForwardLeaveTypeId?: string;
  carryForwardLeaveTypeName?: string;
}

export interface RosterTransferLog {
  id: string;
  fromRosterGroupId: string | null;
  toRosterGroupId: string | null;
  carryForward: boolean;
  createdAt: string;
  actorUser: { id: string; email: string } | null;
  fromRosterGroup: { id: string; name: string } | null;
  toRosterGroup: { id: string; name: string } | null;
  details: RosterTransferDetail[];
}

// Dedicated "Change Roster" action (replaces plain rosterGroupId in
// updateEmployee) — a Roster switch can leave real leave balance behind, so
// the caller must explicitly decide whether to carry it forward. Returns the
// per-leave-type breakdown so the caller can show a summary of what happened.
export async function changeEmployeeRoster(
  id: string,
  input: { rosterGroupId: string | null; carryForward: boolean }
): Promise<{ employee: Employee; details: RosterTransferDetail[] }> {
  const { data } = await apiClient.patch<{ data: Employee; details: RosterTransferDetail[] }>(
    `/employees/${id}/roster`,
    input
  );
  return { employee: data.data, details: data.details };
}

// Same Roster, no leave-balance decision — just pushes this employee's own
// validity window (rosterAssignedAt) forward from today. See
// Backend/src/modules/org/rosterTransfer.service.js::renewEmployeeRoster.
export async function renewEmployeeRoster(id: string): Promise<Employee> {
  const { data } = await apiClient.post<{ data: Employee }>(`/employees/${id}/roster/renew`, {});
  return data.data;
}

export async function listRosterTransferHistory(id: string): Promise<RosterTransferLog[]> {
  const { data } = await apiClient.get<{ data: RosterTransferLog[] }>(`/employees/${id}/roster-transfer-history`);
  return data.data;
}

export async function transferEmployee(
  id: string,
  input: { brandId?: string; departmentId?: string }
): Promise<Employee> {
  const { data } = await apiClient.patch<{ data: Employee }>(`/employees/${id}/transfer`, input);
  return data.data;
}

export async function deleteEmployee(id: string): Promise<void> {
  await apiClient.delete(`/employees/${id}`);
}

// Soft on/off toggle — never deletes the employee. Also flips the linked ESS
// login's own isActive server-side, if one exists, so deactivating blocks
// check-in/leave/etc. access immediately and reactivating (e.g. a rejoin)
// restores it without a fresh invite.
export async function setEmployeeActive(id: string, isActive: boolean): Promise<Employee> {
  const { data } = await apiClient.patch<{ data: Employee }>(`/employees/${id}/active`, { isActive });
  return data.data;
}

// Replaces this employee's assigned "powers" wholesale with the given set
// (empty array = revoke all) — see api/powers.ts for the catalog.
export async function assignEmployeePowers(id: string, powerKeys: string[]): Promise<Employee> {
  const { data } = await apiClient.put<{ data: Employee }>(`/employees/${id}/powers`, { powerKeys });
  return data.data;
}

// Replaces this employee's ADDITIONAL managers wholesale — the primary
// Manager field (managerId, set via updateEmployee) is untouched. Together
// with the primary manager, this is the full set a multi-manager leave
// request needs unanimous approval from — see
// employee.service.js::setEmployeeManagers.
export async function setEmployeeManagers(id: string, managerIds: string[]): Promise<Employee> {
  const { data } = await apiClient.put<{ data: Employee }>(`/employees/${id}/managers`, { managerIds });
  return data.data;
}

// Replaces this employee's photo wholesale — optional, file-based (not a
// URL field). Any previous photo is deleted server-side.
export async function uploadEmployeePhoto(id: string, file: File): Promise<Employee> {
  const formData = new FormData();
  formData.append('photo', file);
  const { data } = await apiClient.post<{ data: Employee }>(`/employees/${id}/photo`, formData);
  return data.data;
}

export async function removeEmployeePhoto(id: string): Promise<Employee> {
  const { data } = await apiClient.delete<{ data: Employee }>(`/employees/${id}/photo`);
  return data.data;
}

// Invites this employee's occupant to log in to the ESS portal — creates a
// login-capable User linked to this employee record (users.employee_id) and
// an Invitation carrying the Employee role, same activation-link pattern as
// inviteCompanyAdmin/inviteGroupAdmin in api/tenancy.ts. brandId is only
// passed by the Brand Admin portal — it's both the rbac.middleware.js
// requirePermission brandId check and, server-side, a defense-in-depth
// check that the target employee actually belongs to that brand (see
// auth.service.js::inviteEmployeeUser).
export async function inviteEmployeeUser(
  employeeId: string,
  email: string,
  brandId?: string
): Promise<InviteResult> {
  const { data } = await apiClient.post<InviteResult>('/auth/signup-invite-employee', {
    employeeId,
    email,
    brandId,
  });
  return data;
}

// Reassigns an already-linked ESS login to a new email — the old login is
// deactivated and unlinked (never deleted), and a fresh invite goes out for
// the new email, same activation-link flow as inviteEmployeeUser. Used when
// an employee wants to switch which inbox they use for ESS access.
export async function transferEmployeeLogin(
  employeeId: string,
  newEmail: string,
  brandId?: string
): Promise<InviteResult> {
  const { data } = await apiClient.post<InviteResult>('/auth/transfer-employee-login', {
    employeeId,
    newEmail,
    brandId,
  });
  return data;
}
