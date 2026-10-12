import { apiClient } from './client';

// Portal-agnostic resignation API (Backend modules/org/resignation.*).
// Only the employee's assigned HR can accept/reject (`canDecide`); managers
// and Company/Brand Admins see them read-only.

export type ResignationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

interface EmployeeRef {
  id: string;
  name: string | null;
  employeeCode: string | null;
}

export interface Resignation {
  id: string;
  companyId: string;
  employeeId: string;
  reason: string;
  requestedLastWorkingDate: string | null;
  status: ResignationStatus;
  lastWorkingDate: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  employee?: EmployeeRef & {
    companyId: string;
    brandId: string | null;
    hrEmployeeId: string | null;
    company?: { id: string; name: string } | null;
    brand?: { id: string; name: string } | null;
    department?: { id: string; name: string } | null;
    designation?: { id: string; title: string } | null;
    hrEmployee?: EmployeeRef | null;
  };
  decidedByEmployee?: EmployeeRef | null;
  // Reviewer lists only.
  isAssignedHr?: boolean;
  canDecide?: boolean;
}

interface ListResult {
  data: Resignation[];
  pagination: { total: number; limit: number; offset: number };
}

export async function listMyResignations(): Promise<{ data: Resignation[]; hr: EmployeeRef | null }> {
  const { data } = await apiClient.get<{ data: Resignation[]; hr: EmployeeRef | null }>('/resignations/mine');
  return data;
}

export async function submitResignation(input: { reason: string; lastWorkingDate?: string }): Promise<Resignation> {
  const { data } = await apiClient.post<{ data: Resignation }>('/resignations', input);
  return data.data;
}

export async function withdrawResignation(id: string): Promise<Resignation> {
  const { data } = await apiClient.patch<{ data: Resignation }>(`/resignations/${id}/withdraw`);
  return data.data;
}

export async function listTeamResignations(params: { status?: string; limit?: number; offset?: number }): Promise<ListResult> {
  const { data } = await apiClient.get<ListResult>('/resignations/team', { params });
  return data;
}

export async function listCompanyResignations(params: { status?: string; limit?: number; offset?: number }): Promise<ListResult> {
  const { data } = await apiClient.get<ListResult>('/resignations', { params });
  return data;
}

export async function decideResignation(
  id: string,
  input: { action: 'accept' | 'reject'; comment?: string; lastWorkingDate?: string }
): Promise<Resignation> {
  const { data } = await apiClient.patch<{ data: Resignation }>(`/resignations/${id}/decision`, input);
  return data.data;
}
