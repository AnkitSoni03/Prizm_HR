import { apiClient } from '../client';
import type { Employee, InviteResult } from '../tenancy';

export interface EmployeeListParams {
  // Unused by Company Admin/Brand Admin's own listing (their scope is
  // resolved server-side from the JWT) — set by the Group Admin portal's
  // read-only company drill-in. See employee.controller.js's list handler.
  companyId?: string;
  brandId?: string;
  departmentId?: string;
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
  dateOfJoining: string;
  employmentType: 'full_time' | 'part_time' | 'contract';
}): Promise<Employee> {
  const { data } = await apiClient.post<{ data: Employee }>('/employees', input);
  return data.data;
}

export async function updateEmployee(
  id: string,
  input: Partial<{
    designationId: string | null;
    employmentType: 'full_time' | 'part_time' | 'contract';
    status: Employee['status'];
    dateOfJoining: string | null;
    managerId: string | null;
  }>
): Promise<Employee> {
  const { data } = await apiClient.patch<{ data: Employee }>(`/employees/${id}`, input);
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

// Replaces this employee's assigned "powers" wholesale with the given set
// (empty array = revoke all) — see api/powers.ts for the catalog.
export async function assignEmployeePowers(id: string, powerKeys: string[]): Promise<Employee> {
  const { data } = await apiClient.put<{ data: Employee }>(`/employees/${id}/powers`, { powerKeys });
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
