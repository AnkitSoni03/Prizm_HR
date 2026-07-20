import { apiClient } from '../client';
import type { HolidayAuditUser } from './holidays';

export interface CompanyPolicy {
  id: string;
  companyId: string;
  title: string;
  body: string | null;
  // Internal GCS object path — not directly browsable (the bucket is
  // private). Use fileDownloadUrl instead, a short-lived (~15 min) signed
  // URL minted fresh by the backend on every read.
  fileUrl: string | null;
  fileDownloadUrl: string | null;
  creator?: HolidayAuditUser | null;
  updater?: HolidayAuditUser | null;
}

export interface CompanyPolicyListResult {
  data: CompanyPolicy[];
  pagination: { total: number; limit: number; offset: number };
}

interface ListParams {
  limit?: number;
  offset?: number;
  // Set by the Group Admin portal's read-only company drill-in — see
  // companyPolicy.controller.js's list handler.
  companyId?: string;
}

export async function listCompanyPolicies(params: ListParams = {}): Promise<CompanyPolicyListResult> {
  const { data } = await apiClient.get<CompanyPolicyListResult>('/company-policies', {
    params: { limit: 100, ...params },
  });
  return data;
}

export async function createCompanyPolicy(input: { title: string; body?: string }): Promise<CompanyPolicy> {
  const { data } = await apiClient.post<{ data: CompanyPolicy }>('/company-policies', input);
  return data.data;
}

export async function updateCompanyPolicy(
  id: string,
  input: { title?: string; body?: string }
): Promise<CompanyPolicy> {
  const { data } = await apiClient.patch<{ data: CompanyPolicy }>(`/company-policies/${id}`, input);
  return data.data;
}

export async function deleteCompanyPolicy(id: string): Promise<void> {
  await apiClient.delete(`/company-policies/${id}`);
}

// Replaces this policy's attachment wholesale (uploads straight through the
// backend to Google Cloud Storage — see companyPolicy.controller.js). No
// Content-Type override here — apiClient's request interceptor strips the
// default application/json header for FormData bodies so the browser can
// set its own "multipart/form-data; boundary=..." header instead.
export async function uploadPolicyAttachment(id: string, file: File): Promise<CompanyPolicy> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<{ data: CompanyPolicy }>(`/company-policies/${id}/attachment`, formData);
  return data.data;
}
