import { apiClient } from './client';

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

export interface Department {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  headEmployeeId: string | null;
  // Drives automatic HR Team role grants (src/utils/hrTeamSync.js,
  // backend) — every employee assigned here gets holiday/leave-balance
  // management powers on top of their normal ESS access.
  isHrDepartment: boolean;
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
  departmentId: string;
  designationId: string | null;
  managerId: string | null;
  userId: string | null;
  name: string;
  employeeCode: string;
  dateOfJoining: string | null;
  employmentType: 'full_time' | 'part_time' | 'contract';
  // Free text — used for Professional Tax slab lookup only (see
  // Backend/src/config/statutoryDefaults.js). An unrecognized/blank value
  // just falls back to the 'default' PT slab.
  workState: string | null;
  status: 'onboarding' | 'active' | 'on_notice' | 'exited' | 'archived';
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

export async function listShifts(companyId: string): Promise<Shift[]> {
  const { data } = await apiClient.get<{ data: Shift[] }>('/attendance/shifts', {
    params: { companyId, limit: 100 },
  });
  return data.data;
}

export async function createShift(input: {
  companyId: string;
  name: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  weeklyOffDays: number[];
}): Promise<Shift> {
  const { data } = await apiClient.post<{ data: Shift }>('/attendance/shifts', input);
  return data.data;
}

export async function updateShift(
  id: string,
  input: {
    companyId: string;
    name: string;
    startTime: string;
    endTime: string;
    isNightShift: boolean;
    weeklyOffDays: number[];
  }
): Promise<Shift> {
  const { data } = await apiClient.patch<{ data: Shift }>(`/attendance/shifts/${id}`, input);
  return data.data;
}

export async function deleteShift(id: string, companyId: string): Promise<void> {
  await apiClient.delete(`/attendance/shifts/${id}`, { params: { companyId } });
}

export async function listShiftRosters(input: { companyId: string; brandId?: string }): Promise<ShiftRoster[]> {
  const { data } = await apiClient.get<{ data: ShiftRoster[] }>('/attendance/rosters', {
    params: { companyId: input.companyId, brandId: input.brandId, limit: 100 },
  });
  return data.data;
}

// Used for the Brand/Company readiness badge — fetches only the count, not
// the rows, so a Company card can cheaply check roster status as soon as
// the Brand list (or, for a brand-less company, the company itself) loads.
// Omitting brandId scopes to every roster in the company — safe for a
// brand-less company since every roster there is company-level by
// construction (brand creation is disabled once usesBrands is false).
export async function getRosterCount(input: { companyId: string; brandId?: string }): Promise<number> {
  const { data } = await apiClient.get<{ pagination: { total: number } }>('/attendance/rosters', {
    params: { companyId: input.companyId, brandId: input.brandId, limit: 1 },
  });
  return data.pagination.total;
}

export async function createShiftRoster(input: {
  companyId: string;
  brandId?: string;
  shiftId: string;
  rosterDate: string;
}): Promise<ShiftRoster> {
  const { data } = await apiClient.post<{ data: ShiftRoster }>('/attendance/rosters', input);
  return data.data;
}

export async function listDepartments(companyId: string): Promise<Department[]> {
  const { data } = await apiClient.get<{ data: Department[] }>('/departments', {
    params: { companyId, limit: 100 },
  });
  return data.data;
}

export async function createDepartment(input: {
  companyId: string;
  name: string;
  code: string;
  isHrDepartment?: boolean;
}): Promise<Department> {
  const { data } = await apiClient.post<{ data: Department }>('/departments', input);
  return data.data;
}

export async function updateDepartment(
  id: string,
  input: { companyId: string; name: string; code: string; isHrDepartment?: boolean }
): Promise<Department> {
  const { data } = await apiClient.patch<{ data: Department }>(`/departments/${id}`, input);
  return data.data;
}

export async function deleteDepartment(id: string, companyId: string): Promise<void> {
  await apiClient.delete(`/departments/${id}`, { params: { companyId } });
}

export async function listDesignations(companyId: string): Promise<Designation[]> {
  const { data } = await apiClient.get<{ data: Designation[] }>('/designations', {
    params: { companyId, limit: 100 },
  });
  return data.data;
}

export async function createDesignation(input: {
  companyId: string;
  title: string;
  level: number | null;
}): Promise<Designation> {
  const { data } = await apiClient.post<{ data: Designation }>('/designations', input);
  return data.data;
}

export async function updateDesignation(
  id: string,
  input: { companyId: string; title: string; level: number | null }
): Promise<Designation> {
  const { data } = await apiClient.patch<{ data: Designation }>(`/designations/${id}`, input);
  return data.data;
}

export async function deleteDesignation(id: string, companyId: string): Promise<void> {
  await apiClient.delete(`/designations/${id}`, { params: { companyId } });
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

export async function createEmployee(input: {
  companyId: string;
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
