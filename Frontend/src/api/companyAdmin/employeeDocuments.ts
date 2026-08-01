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
  status: 'pending' | 'verified' | 'rejected';
  // Who last decided this (verify OR reject), and when — null until a
  // decision is made. Same audit shape as Holiday/CompanyPolicy's
  // creator/updater.
  verifier?: HolidayAuditUser | null;
  verifiedAt: string | null;
  // Only set when status is 'rejected'.
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentUploadRequest {
  id: string;
  employeeId: string;
  documentType: string;
  note: string | null;
  status: 'pending' | 'fulfilled' | 'cancelled';
  // Who asked for it — same audit shape as EmployeeDocument.verifier.
  requestedBy?: HolidayAuditUser | null;
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

// Corrects the title/type only — rejected (409) once the document is
// verified. Left open on a rejected document deliberately, since fixing the
// label is part of correcting it for re-submission.
export async function updateEmployeeDocument(
  employeeId: string,
  id: string,
  type: string
): Promise<EmployeeDocument> {
  const { data } = await apiClient.patch<{ data: EmployeeDocument }>(
    `/employees/${employeeId}/documents/${id}`,
    { type }
  );
  return data.data;
}

// Same "locked once verified" rule as updateEmployeeDocument.
export async function deleteEmployeeDocument(employeeId: string, id: string): Promise<void> {
  await apiClient.delete(`/employees/${employeeId}/documents/${id}`);
}

export async function verifyEmployeeDocument(employeeId: string, id: string): Promise<EmployeeDocument> {
  const { data } = await apiClient.patch<{ data: EmployeeDocument }>(
    `/employees/${employeeId}/documents/${id}/verify`
  );
  return data.data;
}

export async function rejectEmployeeDocument(
  employeeId: string,
  id: string,
  reason: string
): Promise<EmployeeDocument> {
  const { data } = await apiClient.patch<{ data: EmployeeDocument }>(
    `/employees/${employeeId}/documents/${id}/reject`,
    { reason }
  );
  return data.data;
}

// Asks a specific employee to upload a named document (e.g. "PAN Card") —
// gated server-side on employee_document:verify, the same permission
// needed to review/verify a document. The target employee gets an in-app
// notification immediately (see documentUploadRequest.service.js).
export async function listDocumentRequests(employeeId: string): Promise<DocumentUploadRequest[]> {
  const { data } = await apiClient.get<{ data: DocumentUploadRequest[] }>(
    `/employees/${employeeId}/document-requests`
  );
  return data.data;
}

export async function createDocumentRequest(
  employeeId: string,
  input: { documentType: string; note?: string }
): Promise<DocumentUploadRequest> {
  const { data } = await apiClient.post<{ data: DocumentUploadRequest }>(
    `/employees/${employeeId}/document-requests`,
    input
  );
  return data.data;
}

export async function cancelDocumentRequest(employeeId: string, id: string): Promise<DocumentUploadRequest> {
  const { data } = await apiClient.patch<{ data: DocumentUploadRequest }>(
    `/employees/${employeeId}/document-requests/${id}/cancel`
  );
  return data.data;
}
