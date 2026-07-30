import { apiClient } from '../client';
import type { HolidayAuditUser } from './holidays';

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

export async function listEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const { data } = await apiClient.get<{ data: EmployeeDocument[] }>(`/employees/${employeeId}/documents`);
  return data.data;
}

// Uploads straight through the backend to Google Cloud Storage (see
// employeeDocument.controller.js) — no Content-Type override here,
// apiClient's request interceptor strips the default application/json
// header for FormData bodies so the browser can set its own
// "multipart/form-data; boundary=..." header instead.
export async function uploadEmployeeDocument(
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

export async function verifyEmployeeDocument(employeeId: string, id: string): Promise<EmployeeDocument> {
  const { data } = await apiClient.patch<{ data: EmployeeDocument }>(
    `/employees/${employeeId}/documents/${id}/verify`
  );
  return data.data;
}
