import { apiClient } from '../client';

export interface EmployeeProfile {
  id: string;
  companyId: string;
  brandId: string | null;
  departmentId: string;
  designationId: string | null;
  managerId: string | null;
  name: string;
  employeeCode: string;
  dateOfJoining: string | null;
  employmentType: 'full_time' | 'part_time' | 'contract';
  status: 'onboarding' | 'active' | 'on_notice' | 'exited' | 'archived';
  brand?: { id: string; name: string };
  department?: { id: string; name: string };
  designation?: { id: string; title: string } | null;
  manager?: { id: string; name: string; employeeCode: string } | null;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  type: string;
  fileUrl: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

// Read-only — profile changes go through Company Admin/HR, not self-service.
// Both endpoints are gated employee:read_own / employee_document:read_own,
// scoped server-side to the caller's own employeeId.
export async function getMyProfile(employeeId: string): Promise<EmployeeProfile> {
  const { data } = await apiClient.get<{ data: EmployeeProfile }>(`/employees/${employeeId}`);
  return data.data;
}

export async function listMyDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const { data } = await apiClient.get<{ data: EmployeeDocument[] }>(`/employees/${employeeId}/documents`);
  return data.data;
}
