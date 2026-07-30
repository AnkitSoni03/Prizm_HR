import { apiClient } from '../client';
import type { HolidayAuditUser } from '../companyAdmin/holidays';

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
  photoDownloadUrl?: string | null;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  type: string;
  // Internal GCS object path — not directly browsable (the bucket is
  // private). Use fileDownloadUrl instead, a short-lived (~15 min) signed
  // URL minted fresh by the backend on every read.
  fileUrl: string | null;
  fileDownloadUrl: string | null;
  // Same signed URL family as fileDownloadUrl, but with a forced
  // Content-Disposition: attachment — use this one for a real Save-As
  // (fileDownloadUrl is for inline preview instead).
  fileAttachmentUrl: string | null;
  verified: boolean;
  // Who verified it (and when) — null until verified. Same audit shape as
  // Holiday/CompanyPolicy's creator/updater.
  verifier?: HolidayAuditUser | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Read-only — profile changes go through Company Admin/HR, not self-service
// (the exceptions are the profile photo, self-uploadable via
// api/myPhoto.ts's dedicated /employees/me/photo endpoint, and documents
// below). Endpoints are gated employee:read_own / employee_document:read_own
// / employee_document:upload_own, scoped server-side to the caller's own
// employeeId.
export async function getMyProfile(employeeId: string): Promise<EmployeeProfile> {
  const { data } = await apiClient.get<{ data: EmployeeProfile }>(`/employees/${employeeId}`);
  return data.data;
}

export async function listMyDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const { data } = await apiClient.get<{ data: EmployeeDocument[] }>(`/employees/${employeeId}/documents`);
  return data.data;
}

// Uploads straight through the backend to Google Cloud Storage — no
// Content-Type override here, apiClient's request interceptor strips the
// default application/json header for FormData bodies so the browser can
// set its own "multipart/form-data; boundary=..." header instead.
export async function uploadMyDocument(
  employeeId: string,
  input: { type: string; file: File }
): Promise<EmployeeDocument> {
  const formData = new FormData();
  formData.append('type', input.type);
  formData.append('file', input.file);
  const { data } = await apiClient.post<{ data: EmployeeDocument }>(
    `/employees/${employeeId}/documents`,
    formData
  );
  return data.data;
}
