import { apiClient } from '../client';

export interface CompOffPolicy {
  id: string;
  companyId: string;
  // NULL = shared across every Brand in the company.
  brandId: string | null;
  name: string;
  expiryDays: number;
  carryForward: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompOffPolicyEmployee {
  id: string;
  employeeCode: string | null;
  name: string | null;
  brandId: string | null;
  department: { id: string; name: string } | null;
  compOffPolicy: { id: string; name: string } | null;
}

export async function listCompOffPolicies(params: { brandId?: string } = {}): Promise<CompOffPolicy[]> {
  const { data } = await apiClient.get<{ data: CompOffPolicy[] }>('/leave/comp-off-policies', { params });
  return data.data;
}

export async function createCompOffPolicy(input: {
  name: string;
  expiryDays: number;
  carryForward: boolean;
  // Omit (or '') for a Comp-Off Policy shared across every Brand.
  brandId?: string;
}): Promise<CompOffPolicy> {
  const { data } = await apiClient.post<{ data: CompOffPolicy }>('/leave/comp-off-policies', input);
  return data.data;
}

export async function updateCompOffPolicy(
  id: string,
  input: Partial<{ name: string; expiryDays: number; carryForward: boolean; brandId: string }>
): Promise<CompOffPolicy> {
  const { data } = await apiClient.patch<{ data: CompOffPolicy }>(`/leave/comp-off-policies/${id}`, input);
  return data.data;
}

export async function deleteCompOffPolicy(id: string): Promise<void> {
  await apiClient.delete(`/leave/comp-off-policies/${id}`);
}

// All active employees in scope (company-wide for Company Admin/HR Manager,
// own-brand-only for Brand Admin — enforced server-side), each showing
// whichever Comp-Off Policy they're currently assigned to, if any. brandId
// further narrows a company-wide caller's own view to one Brand.
export async function listEmployeesForCompOffAssignment(
  search?: string,
  brandId?: string
): Promise<CompOffPolicyEmployee[]> {
  const { data } = await apiClient.get<{ data: CompOffPolicyEmployee[] }>('/leave/comp-off-policies/employees', {
    params: { search: search || undefined, brandId },
  });
  return data.data;
}

// compOffPolicyId: null un-enrolls the selected employees from the comp-off
// benefit entirely.
export async function assignCompOffPolicy(input: {
  employeeIds: string[];
  compOffPolicyId: string | null;
}): Promise<{ updated: number }> {
  const { data } = await apiClient.post<{ data: { updated: number } }>('/leave/comp-off-policies/assign', input);
  return data.data;
}
