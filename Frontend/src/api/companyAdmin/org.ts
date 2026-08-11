import { apiClient } from '../client';
import type { Brand, Department, Designation } from '../tenancy';

// Company Admin's own companyId always comes from their JWT (req.auth.companyId
// on the backend), so none of these calls send a companyId — unlike the Super
// Admin portal's api/tenancy.ts, which must pass one explicitly since Super
// Admin has no company of their own.

export async function listBrands(): Promise<Brand[]> {
  const { data } = await apiClient.get<{ data: Brand[] }>('/brands', { params: { limit: 100 } });
  return data.data;
}

export async function listDepartments(): Promise<Department[]> {
  const { data } = await apiClient.get<{ data: Department[] }>('/departments', { params: { limit: 100 } });
  return data.data;
}

export async function createDepartment(input: {
  name: string;
  code?: string;
}): Promise<Department> {
  const { data } = await apiClient.post<{ data: Department }>('/departments', input);
  return data.data;
}

export async function updateDepartment(
  id: string,
  input: { name: string; code?: string }
): Promise<Department> {
  const { data } = await apiClient.patch<{ data: Department }>(`/departments/${id}`, input);
  return data.data;
}

export async function deleteDepartment(id: string): Promise<void> {
  await apiClient.delete(`/departments/${id}`);
}

export async function listDesignations(): Promise<Designation[]> {
  const { data } = await apiClient.get<{ data: Designation[] }>('/designations', { params: { limit: 100 } });
  return data.data;
}

export async function createDesignation(input: { title: string; level: number | null }): Promise<Designation> {
  const { data } = await apiClient.post<{ data: Designation }>('/designations', input);
  return data.data;
}

export async function updateDesignation(
  id: string,
  input: { title: string; level: number | null }
): Promise<Designation> {
  const { data } = await apiClient.patch<{ data: Designation }>(`/designations/${id}`, input);
  return data.data;
}

export async function deleteDesignation(id: string): Promise<void> {
  await apiClient.delete(`/designations/${id}`);
}
