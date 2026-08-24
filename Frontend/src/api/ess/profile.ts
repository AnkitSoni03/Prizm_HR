import { apiClient } from '../client';
import type { HolidayAuditUser } from '../companyAdmin/holidays';

export interface EmployeeShiftSummary {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  weeklyOffDays: number[];
}

export interface EmployeeProfile {
  id: string;
  companyId: string;
  brandId: string | null;
  departmentId: string;
  designationId: string | null;
  managerId: string | null;
  rosterGroupId: string | null;
  name: string;
  employeeCode: string;
  dateOfJoining: string | null;
  // Captured by Company Admin/Brand Admin when filling in an employee's
  // details, not required at creation.
  dateOfBirth: string | null;
  // Free text — used for Professional Tax slab lookup only. An unrecognized
  // or blank value just falls back to the 'default' PT slab.
  workState: string | null;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'probation';
  status: 'onboarding' | 'active' | 'on_notice' | 'exited' | 'archived';
  company?: { id: string; name: string };
  brand?: { id: string; name: string };
  department?: { id: string; name: string };
  designation?: { id: string; title: string } | null;
  manager?: { id: string; name: string; employeeCode: string } | null;
  // Filled in only when managerId is null — whichever admin is actually
  // responsible for you (your Brand's Brand Admin, else the Company Admin).
  // Display-only fallback, not a real manager assignment — see
  // employee.service.js::resolveEffectiveManager.
  effectiveManager?: { id: string; name: string } | null;
  // The Roster that now drives this employee's Shift/Holidays/Company
  // Policies/Leave — null means none assigned yet (everything shows blank
  // until one is, see LeaveBalancePage.tsx and HolidaysPage.tsx).
  // validityValue/validityUnit are null when the Roster has no expiry
  // configured — pair with rosterAssignedAt (below) via
  // utils/rosterValidity.ts's computeRosterExpiry, same as
  // EmployeeDetailModal.tsx's admin-facing view.
  rosterGroup?: { id: string; name: string; validityValue: number | null; validityUnit: 'days' | 'months' | null } | null;
  // Date this employee was assigned to their CURRENT Roster — null if never
  // assigned. Anchors rosterGroup's own validity window.
  rosterAssignedAt: string | null;
  // Null means comp-off is not active for this employee — they earn no
  // credit for working a holiday/week-off until an admin assigns one on the
  // Comp Off Setting page (see Backend's compOff.service.js).
  compOffPolicy?: { id: string; name: string } | null;
  photoDownloadUrl?: string | null;
  // Standing default shift (employee_shifts) — this mechanism has no admin
  // UI left anywhere (Shift assignment now flows entirely through Roster),
  // so this is null for virtually everyone going forward; kept only for any
  // pre-existing assignment from before that change.
  defaultShift: EmployeeShiftSummary | null;
  // A published shift_rosters entry for today, if one exists — overrides
  // defaultShift/the Roster's own shift per CLAUDE.md rule 7 ("Roster >
  // default shift").
  todayRoster: { id: string; rosterDate: string; shift: EmployeeShiftSummary | null } | null;
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

// Corrects the title/type only — rejected (409) once the document is
// verified. Left open on a rejected document deliberately, since fixing the
// label is part of correcting it for re-submission.
export async function updateMyDocument(employeeId: string, id: string, type: string): Promise<EmployeeDocument> {
  const { data } = await apiClient.patch<{ data: EmployeeDocument }>(
    `/employees/${employeeId}/documents/${id}`,
    { type }
  );
  return data.data;
}

// Same "locked once verified" rule as updateMyDocument.
export async function deleteMyDocument(employeeId: string, id: string): Promise<void> {
  await apiClient.delete(`/employees/${employeeId}/documents/${id}`);
}

export interface DocumentUploadRequest {
  id: string;
  employeeId: string;
  documentType: string;
  note: string | null;
  status: 'pending' | 'fulfilled' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

// An admin/document-verifier can ask for a specific document by name (e.g.
// "PAN Card") — this employee gets an in-app notification the moment it's
// created (see documentUploadRequest.service.js) and sees it here until
// it's marked done (completeMyDocumentRequest) or cancelled by the requester.
export async function listMyDocumentRequests(employeeId: string): Promise<DocumentUploadRequest[]> {
  const { data } = await apiClient.get<{ data: DocumentUploadRequest[] }>(
    `/employees/${employeeId}/document-requests`
  );
  return data.data;
}

// A simple manual acknowledgment — not tied to any specific upload. The
// employee uploads the actual file separately through the normal Documents
// section, then dismisses the reminder here once they've handled it.
export async function completeMyDocumentRequest(employeeId: string, id: string): Promise<DocumentUploadRequest> {
  const { data } = await apiClient.patch<{ data: DocumentUploadRequest }>(
    `/employees/${employeeId}/document-requests/${id}/done`
  );
  return data.data;
}
