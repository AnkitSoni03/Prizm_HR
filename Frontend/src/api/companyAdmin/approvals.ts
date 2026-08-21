import { apiClient } from '../client';

export interface RequestEmployee {
  id: string;
  employeeCode: string;
  name?: string | null;
  photoDownloadUrl?: string | null;
}

// The reliable "who decided this" identity — a User always exists for any
// authenticated caller, unlike the Employee-linked approverId, which is null
// for a Company/Brand/Group Admin with no Employee record of their own.
export interface ApproverUser {
  id: string;
  email: string;
  employee?: { id: string; name: string | null } | null;
}

export function describeApprover(approverUser?: ApproverUser | null): string {
  if (!approverUser) return '—';
  return approverUser.employee?.name || approverUser.email;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  carryForward: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId: string | null;
  approverUserId: string | null;
  approverUser?: ApproverUser | null;
  rejectionReason: string | null;
  compOffCreditId: string | null;
  employee?: RequestEmployee;
  leaveType?: LeaveType;
}

export interface OdRequest {
  id: string;
  employeeId: string;
  fromDate: string;
  toDate: string;
  purpose: string;
  location: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId: string | null;
  approverUserId: string | null;
  approverUser?: ApproverUser | null;
  rejectionReason: string | null;
  employee?: RequestEmployee;
}

export interface AttendanceRegularization {
  id: string;
  attendanceId: string;
  employeeId: string;
  requestedStatus: 'present' | 'absent' | 'half_day' | 'leave' | 'holiday' | 'weekoff' | 'on_duty';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approverId: string | null;
  approverUserId: string | null;
  approverUser?: ApproverUser | null;
  rejectionReason: string | null;
  employee?: RequestEmployee;
  attendance?: { id: string; date: string; status: string };
}

export interface CompOffCredit {
  id: string;
  employeeId: string;
  sourceAttendanceId: string;
  earnedDate: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'expired' | 'used';
  approverId: string | null;
  approverUserId: string | null;
  approverUser?: ApproverUser | null;
  rejectionReason: string | null;
  // Null means "earned under a carry-forward Comp-Off Policy — never
  // expires".
  expiryDate: string | null;
  employee?: RequestEmployee;
}

export interface ApprovalHistoryEntry {
  id: string;
  action: 'approved' | 'rejected';
  reason: string | null;
  decidedAt: string;
  actorUser?: ApproverUser | null;
}

interface ListResult<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number };
}

interface ListParams {
  status?: string;
  limit?: number;
  offset?: number;
  // Unused by Company Admin/HR Manager (their own companyId is resolved
  // server-side from the JWT) — set by the Group Admin portal to drill into
  // one Company, or the Brand Admin portal to scope to their own Brand. See
  // leaveRequest.controller.js/odRequest.controller.js/etc.'s list handlers.
  companyId?: string;
  brandId?: string;
  // Set by the ESS "Team Approvals" page: 'reports' for a manager's direct
  // reports, 'company' for an employee holding the company-wide "Approve
  // Leave/OD Requests" power — see leaveRequest.routes.js/
  // odRequest.routes.js's requireReadAccess. Only leave/OD requests support
  // this today.
  scope?: 'reports' | 'company';
  // Comp-off only — a company/brand-wide `comp_off:read` holder (Company
  // Admin/HR Manager/Brand Admin) can filter to one specific employee's own
  // credits (see compOff.controller.js::list). A Brand Admin passing an
  // employeeId outside their own brand just gets zero rows back, not an
  // error — the brand scope is enforced server-side regardless.
  employeeId?: string;
}

export async function listLeaveRequests(params: ListParams = {}): Promise<ListResult<LeaveRequest>> {
  const { data } = await apiClient.get<ListResult<LeaveRequest>>('/leave/requests', { params });
  return data;
}

export async function approveLeaveRequest(id: string): Promise<LeaveRequest> {
  const { data } = await apiClient.patch<{ data: LeaveRequest }>(`/leave/requests/${id}/approve`);
  return data.data;
}

export async function rejectLeaveRequest(id: string, reason: string): Promise<LeaveRequest> {
  const { data } = await apiClient.patch<{ data: LeaveRequest }>(`/leave/requests/${id}/reject`, { reason });
  return data.data;
}

export async function getLeaveRequestHistory(id: string): Promise<ApprovalHistoryEntry[]> {
  const { data } = await apiClient.get<{ data: ApprovalHistoryEntry[] }>(`/leave/requests/${id}/history`);
  return data.data;
}

export async function listOdRequests(params: ListParams = {}): Promise<ListResult<OdRequest>> {
  const { data } = await apiClient.get<ListResult<OdRequest>>('/attendance/od-requests', { params });
  return data;
}

export async function approveOdRequest(id: string): Promise<OdRequest> {
  const { data } = await apiClient.patch<{ data: OdRequest }>(`/attendance/od-requests/${id}/approve`);
  return data.data;
}

export async function rejectOdRequest(id: string, reason: string): Promise<OdRequest> {
  const { data } = await apiClient.patch<{ data: OdRequest }>(`/attendance/od-requests/${id}/reject`, { reason });
  return data.data;
}

export async function getOdRequestHistory(id: string): Promise<ApprovalHistoryEntry[]> {
  const { data } = await apiClient.get<{ data: ApprovalHistoryEntry[] }>(`/attendance/od-requests/${id}/history`);
  return data.data;
}

export async function listRegularizations(
  params: ListParams = {}
): Promise<ListResult<AttendanceRegularization>> {
  const { data } = await apiClient.get<ListResult<AttendanceRegularization>>('/attendance/regularizations', {
    params,
  });
  return data;
}

export async function approveRegularization(id: string): Promise<AttendanceRegularization> {
  const { data } = await apiClient.patch<{ data: AttendanceRegularization }>(
    `/attendance/regularizations/${id}/approve`
  );
  return data.data;
}

export async function rejectRegularization(id: string, reason: string): Promise<AttendanceRegularization> {
  const { data } = await apiClient.patch<{ data: AttendanceRegularization }>(
    `/attendance/regularizations/${id}/reject`,
    { reason }
  );
  return data.data;
}

export async function getRegularizationHistory(id: string): Promise<ApprovalHistoryEntry[]> {
  const { data } = await apiClient.get<{ data: ApprovalHistoryEntry[] }>(`/attendance/regularizations/${id}/history`);
  return data.data;
}

export async function listCompOffCredits(params: ListParams = {}): Promise<ListResult<CompOffCredit>> {
  const { data } = await apiClient.get<ListResult<CompOffCredit>>('/leave/comp-off', { params });
  return data;
}

export async function approveCompOffCredit(id: string): Promise<CompOffCredit> {
  const { data } = await apiClient.patch<{ data: CompOffCredit }>(`/leave/comp-off/${id}/approve`);
  return data.data;
}

export async function rejectCompOffCredit(id: string, reason: string): Promise<CompOffCredit> {
  const { data } = await apiClient.patch<{ data: CompOffCredit }>(`/leave/comp-off/${id}/reject`, { reason });
  return data.data;
}

export async function getCompOffHistory(id: string): Promise<ApprovalHistoryEntry[]> {
  const { data } = await apiClient.get<{ data: ApprovalHistoryEntry[] }>(`/leave/comp-off/${id}/history`);
  return data.data;
}
