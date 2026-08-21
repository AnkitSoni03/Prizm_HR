import { apiClient } from './client';
import type { RosterPolicyGroup } from './companyAdmin/rosterGroups';

export interface PlatformCompanyTrendPoint {
  month: string;
  joined: number;
  exited: number;
}

export interface PlatformDashboardSummary {
  groupCount: number;
  companyCount: number;
  brandCount: number;
  employeeCount: number;
  companyStatusBreakdown: Record<'trial' | 'active' | 'grace' | 'suspended' | 'terminated', number>;
  companyTrend: PlatformCompanyTrendPoint[];
}

// Platform-wide, unscoped — Super Admin only (requireSuperAdmin, a
// structural gate, not a permission code — see dashboard.routes.js).
export async function getPlatformDashboardSummary(): Promise<PlatformDashboardSummary> {
  const { data } = await apiClient.get<{ data: PlatformDashboardSummary }>('/dashboard/platform-summary');
  return data.data;
}

export interface Group {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  planId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  groupId: string;
  name: string;
  legalName: string | null;
  gstNumber: string | null;
  status: 'trial' | 'active' | 'grace' | 'suspended' | 'terminated';
  planId: string | null;
  usesBrands: boolean;
  faceAntispoofEnforced: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Shift {
  id: string;
  companyId: string;
  name: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  weeklyOffDays: number[];
  // Empty = no Roster uses this shift yet. A Roster can have at most one
  // Shift — enforced server-side (409 on a conflicting second assignment).
  rosterGroups?: RosterPolicyGroup[];
  createdAt: string;
  updatedAt: string;
}

export interface ShiftRoster {
  id: string;
  employeeId: string | null;
  shiftId: string;
  companyId: string;
  brandId: string | null;
  rosterDate: string;
  status: 'draft' | 'published';
  publishedBy: string | null;
  shift?: Shift;
  createdAt: string;
  updatedAt: string;
}

// Trimmed shape of Shift returned inline on Employee.defaultShift/todayRoster
// (see employee.service.js::getEmployeeForRead's shiftSummary()) — no
// companyId/createdAt/updatedAt, those aren't needed for display.
export interface EmployeeShiftSummary {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  weeklyOffDays: number[];
}

export interface Department {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  headEmployeeId: string | null;
}

export interface Designation {
  id: string;
  companyId: string;
  title: string;
  level: number | null;
}

export interface Employee {
  id: string;
  companyId: string;
  brandId: string | null;
  // Optional: Super Admin's minimal "name only" employee creation leaves
  // this unset — Company Admin assigns it later via transfer.
  departmentId: string | null;
  designationId: string | null;
  managerId: string | null;
  // Optional add-on: null keeps this employee on company/brand-wide
  // holidays, the company-wide leave policy, and their own employee_shifts
  // default — exactly as if Roster Groups didn't exist.
  rosterGroupId: string | null;
  userId: string | null;
  name: string;
  // Optional: Super Admin's minimal "name only" employee creation leaves
  // this unset — Company Admin/Brand Admin assign a real code later.
  employeeCode: string | null;
  dateOfJoining: string | null;
  // Optional — captured by Company Admin/Brand Admin when filling in an
  // employee's details, not required at creation.
  dateOfBirth: string | null;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'probation';
  // Free text — used for Professional Tax slab lookup only (see
  // Backend/src/config/statutoryDefaults.js). An unrecognized/blank value
  // just falls back to the 'default' PT slab.
  workState: string | null;
  status: 'onboarding' | 'active' | 'on_notice' | 'exited' | 'archived';
  // On/off account toggle, separate from the HR-lifecycle `status` above —
  // "employee left, don't delete their record" (see
  // employee.service.js::setEmployeeActiveStatus). Cascades to the linked
  // ESS login's own isActive when toggled.
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Optional, admin-assigned dedicated Role holding this employee's
  // hand-picked "powers" (see api/powers.ts) — customRole is only present
  // when eager-loaded by GET /employees/:id, used to pre-check which power
  // keys are already assigned when the edit modal opens.
  customRoleId?: string | null;
  customRole?: { id: string; permissions: { code: string }[] } | null;
  // Signed, short-lived download URL resolved fresh on every response — see
  // employee.service.js::withPhotoUrl. Null when no photo has been uploaded
  // (the common case; always optional).
  photoDownloadUrl?: string | null;
  // The ESS login currently linked to this employee (userId), only present
  // when eager-loaded by GET /employees/:id — lets EmployeeDetailModal.tsx
  // show which email they log in with and offer to transfer it.
  loginUser?: { id: string; email: string; isActive: boolean; status: string } | null;
  // Standing default shift (employee_shifts, resolved as of today) and any
  // published shift_rosters override for today — only present when
  // eager-loaded by GET /employees/:id (see employee.service.js::
  // getEmployeeForRead). null means none is assigned/published.
  defaultShift?: EmployeeShiftSummary | null;
  todayRoster?: { id: string; rosterDate: string; shift: EmployeeShiftSummary | null } | null;
  // Null means comp-off is not active for this employee — they earn no
  // credit for working a holiday/week-off until assigned one on the Comp
  // Off Setting page. Only present when eager-loaded by GET /employees/:id.
  compOffPolicy?: { id: string; name: string } | null;
}

export interface Plan {
  id: string;
  name: string;
  code: string;
  billingCycle: 'monthly' | 'yearly';
  price: string | null;
  isActive: boolean;
}

export interface InviteResult {
  user: { id: string; email: string; status: string };
  invitation: { id: string; expiresAt: string };
  activationToken?: string;
}

// null means no admin has ever been invited for this Group/Company/Brand
// (e.g. "Skip for now" was clicked during creation and never followed up).
export interface AdminInvitation {
  email: string;
  status: 'invited' | 'active' | 'disabled';
}

export async function listGroups(): Promise<Group[]> {
  const { data } = await apiClient.get<{ data: Group[] }>('/groups', { params: { limit: 100 } });
  return data.data;
}

export async function createGroup(input: {
  name: string;
  status: 'active' | 'suspended';
  planId: string | null;
}): Promise<Group> {
  const { data } = await apiClient.post<{ data: Group }>('/groups', input);
  return data.data;
}

export async function updateGroup(
  id: string,
  input: Partial<{ name: string; status: 'active' | 'suspended'; planId: string | null }>
): Promise<Group> {
  const { data } = await apiClient.patch<{ data: Group }>(`/groups/${id}`, input);
  return data.data;
}

export async function getGroupAdminInvitation(id: string): Promise<AdminInvitation | null> {
  const { data } = await apiClient.get<{ data: AdminInvitation | null }>(`/groups/${id}/admin-invitation`);
  return data.data;
}

export async function deleteGroup(id: string): Promise<void> {
  await apiClient.delete(`/groups/${id}`);
}

// groupId is optional: a Group Admin's own group is resolved server-side
// from the JWT (company.service.js::listCompanies), so the Group Admin
// portal calls this with no argument at all; the Super Admin portal always
// passes one explicitly (Super Admin has no group of their own).
export async function listCompanies(groupId?: string): Promise<Company[]> {
  const { data } = await apiClient.get<{ data: Company[] }>('/companies', {
    params: { groupId, limit: 100 },
  });
  return data.data;
}

export async function createCompany(input: {
  groupId: string;
  name: string;
  legalName: string;
  gstNumber: string;
  planId: string | null;
  usesBrands: boolean;
}): Promise<Company> {
  const { data } = await apiClient.post<{ data: Company }>('/companies', input);
  return data.data;
}

export async function getCompany(id: string): Promise<Company> {
  const { data } = await apiClient.get<{ data: Company }>(`/companies/${id}`);
  return data.data;
}

export async function updateCompany(
  id: string,
  input: Partial<{
    name: string;
    legalName: string | null;
    gstNumber: string | null;
    planId: string | null;
    status: Company['status'];
    faceAntispoofEnforced: boolean;
  }>
): Promise<Company> {
  const { data } = await apiClient.patch<{ data: Company }>(`/companies/${id}`, input);
  return data.data;
}

export async function getCompanyAdminInvitation(id: string): Promise<AdminInvitation | null> {
  const { data } = await apiClient.get<{ data: AdminInvitation | null }>(`/companies/${id}/admin-invitation`);
  return data.data;
}

export async function deleteCompany(id: string): Promise<void> {
  await apiClient.delete(`/companies/${id}`);
}

// companyId is optional: Super Admin's platform-wide Users directory calls
// this with no filter at all, relying on the same "no companyId → no scope
// filter" behavior listCompanies()/listEmployees() already rely on for a
// Super Admin caller (see resolveCompanyScope.js).
export async function listBrands(companyId?: string): Promise<Brand[]> {
  const { data } = await apiClient.get<{ data: Brand[] }>('/brands', {
    params: { companyId, limit: 100 },
  });
  return data.data;
}

export async function createBrand(input: {
  companyId: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
}): Promise<Brand> {
  const { data } = await apiClient.post<{ data: Brand }>('/brands', input);
  return data.data;
}

export async function updateBrand(
  id: string,
  input: Partial<{
    name: string;
    code: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    isActive: boolean;
  }>
): Promise<Brand> {
  const { data } = await apiClient.patch<{ data: Brand }>(`/brands/${id}`, input);
  return data.data;
}

export async function getBrandAdminInvitation(id: string): Promise<AdminInvitation | null> {
  const { data } = await apiClient.get<{ data: AdminInvitation | null }>(`/brands/${id}/admin-invitation`);
  return data.data;
}

// Blocked (409) server-side if any employees are still assigned to this
// brand — the caller must reassign/remove them first.
export async function deleteBrand(id: string): Promise<void> {
  await apiClient.delete(`/brands/${id}`);
}

// brandId omitted (companyId supplied instead) lists every employee in the
// company — used for a brand-less company's company-level Employees panel.
export async function listEmployees(input: { companyId?: string; brandId?: string }): Promise<Employee[]> {
  const { data } = await apiClient.get<{ data: Employee[] }>('/employees', {
    params: { companyId: input.companyId, brandId: input.brandId, limit: 100 },
  });
  return data.data;
}

// Powers the Super Admin "Users" directory — no companyId/brandId filter
// (every employee on the platform, regardless of which admin created it),
// paginated with an actual total so the caller can page through everything
// in fixed-size chunks rather than relying on the 100-row cap other list*
// helpers silently apply.
export async function listEmployeesPage(input: {
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: Employee[]; total: number }> {
  const { data } = await apiClient.get<{ data: Employee[]; pagination: { total: number } }>('/employees', {
    params: { search: input.search || undefined, limit: input.limit, offset: input.offset },
  });
  return { rows: data.data, total: data.pagination.total };
}

// employeeCode/departmentId/dateOfJoining/employmentType are all optional —
// Super Admin's minimal "name only" flow (see EmployeeFormModal.tsx) omits
// them entirely; the backend auto-generates employeeCode and defaults
// employmentType to full_time. Company Admin sets up the rest afterward.
export async function createEmployee(input: {
  companyId: string;
  name: string;
  employeeCode?: string;
  brandId?: string;
  departmentId?: string;
  designationId?: string | null;
  managerId?: string | null;
  dateOfJoining?: string;
  employmentType?: 'full_time' | 'part_time' | 'contract' | 'probation';
}): Promise<Employee> {
  const { data } = await apiClient.post<{ data: Employee }>('/employees', input);
  return data.data;
}

// Permanent, irreversible hard-delete (employee.service.js::
// deleteEmployeePermanently) — a deliberate, explicit exception to this
// project's usual soft-delete-only rule, not a plain deactivate. Removes the
// employee and everything that belongs to them.
export async function deleteEmployee(id: string): Promise<void> {
  await apiClient.delete(`/employees/${id}`);
}

// Optional, file-based (not a URL field) — any previous photo is deleted
// server-side. Mirrors api/companyAdmin/employees.ts's own copy, used by the
// Super Admin portal's Employee form/detail views instead.
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

export async function listPlans(): Promise<Plan[]> {
  const { data } = await apiClient.get<{ data: Plan[] }>('/plans');
  return data.data;
}

export async function inviteCompanyAdmin(input: {
  companyId: string;
  email: string;
}): Promise<InviteResult> {
  const { data } = await apiClient.post<InviteResult>('/auth/signup-invite', input);
  return data;
}

export async function inviteGroupAdmin(input: {
  groupId: string;
  email: string;
}): Promise<InviteResult> {
  const { data } = await apiClient.post<InviteResult>('/auth/signup-invite-group', input);
  return data;
}

export async function inviteBrandAdmin(input: {
  brandId: string;
  email: string;
}): Promise<InviteResult> {
  const { data } = await apiClient.post<InviteResult>('/auth/signup-invite-brand', input);
  return data;
}
