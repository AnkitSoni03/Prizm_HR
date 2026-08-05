import { apiClient } from '../client';

export type AttendanceRosterStatus = 'present' | 'absent' | 'half_day' | 'leave' | 'holiday' | 'weekoff' | 'on_duty' | 'not_marked';

// One row per active employee in scope for the selected date — unlike a
// raw attendance-table dump, an employee with no punch that day still shows
// up (status: 'not_marked') instead of silently disappearing, since that's
// exactly who a bulk status correction needs to target. leaveTypeName is
// only set when status is 'leave' — the specific leave type (e.g. "Annual
// Leave") covering that date, resolved server-side from the approved
// LeaveRequest behind it.
export interface AttendanceRosterRow {
  employeeId: string;
  employeeCode: string;
  name: string | null;
  brandId: string | null;
  attendanceId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceRosterStatus;
  source: 'qr' | 'od' | 'office_kiosk' | 'face' | null;
  leaveTypeName: string | null;
}

interface ListResult<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number };
}

export async function listAttendanceRoster(params: {
  date: string;
  search?: string;
  brandId?: string;
  // 'leave' + leaveTypeId filters to one specific leave type; 'leave'
  // alone (no leaveTypeId) is accepted server-side but unused by this UI.
  status?: 'present' | 'absent' | 'half_day' | 'leave';
  leaveTypeId?: string;
  limit?: number;
  offset?: number;
}): Promise<ListResult<AttendanceRosterRow>> {
  const { data } = await apiClient.get<ListResult<AttendanceRosterRow>>('/attendance/roster', { params });
  return data;
}

// Every leave-type-scoped status is expressed the same way here: 'leave'
// plus a leaveTypeId, never a bare "on leave" — see attendance.service.js's
// bulkSetAttendanceStatus for why (it needs the id to file a real,
// balance-consuming LeaveRequest, not just paint the attendance row).
export type ManualAttendanceStatus = 'present' | 'half_day' | 'absent' | 'leave';

export interface BulkStatusFailure {
  employeeId: string;
  name: string | null;
  error: string;
}

// Bulk-corrects any number of employees' attendance status for one date in
// a single call — the "employee forgot to mark their attendance" admin
// override. Each employee is applied independently server-side, so one
// employee's failure (e.g. insufficient leave balance) doesn't block the
// rest — check `failures` even on a 200.
export async function bulkUpdateAttendanceStatus(input: {
  employeeIds: string[];
  date: string;
  status: ManualAttendanceStatus;
  leaveTypeId?: string;
}): Promise<{ updated: number; total: number; failures: BulkStatusFailure[] }> {
  const { data } = await apiClient.patch<{ data: { updated: number; total: number; failures: BulkStatusFailure[] } }>(
    '/attendance/bulk-status',
    input
  );
  return data.data;
}

// Signed URL is minted fresh on every call (~15 min TTL, same convention as
// company policy attachments) — never cached beyond the click that asked
// for it.
export async function getAttendanceVideoUrl(id: string, type: 'checkin' | 'checkout'): Promise<string> {
  const { data } = await apiClient.get<{ data: { url: string } }>(`/attendance/${id}/video-url`, {
    params: { type },
  });
  return data.data.url;
}
