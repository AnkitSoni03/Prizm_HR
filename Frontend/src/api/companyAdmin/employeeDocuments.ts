import { apiClient } from '../client';

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  type: string;
  fileUrl: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const { data } = await apiClient.get<{ data: EmployeeDocument[] }>(`/employees/${employeeId}/documents`);
  return data.data;
}

export async function uploadEmployeeDocument(
  employeeId: string,
  input: { type: string; fileUrl: string }
): Promise<EmployeeDocument> {
  const { data } = await apiClient.post<{ data: EmployeeDocument }>(
    `/employees/${employeeId}/documents`,
    input
  );
  return data.data;
}

export async function verifyEmployeeDocument(employeeId: string, id: string): Promise<EmployeeDocument> {
  const { data } = await apiClient.patch<{ data: EmployeeDocument }>(
    `/employees/${employeeId}/documents/${id}/verify`
  );
  return data.data;
}
