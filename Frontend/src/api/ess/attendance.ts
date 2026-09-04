import { apiClient } from '../client';

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  source: 'qr' | 'od' | 'office_kiosk' | 'face' | null;
  status: 'present' | 'absent' | 'half_day' | 'leave' | 'holiday' | 'weekoff' | 'on_duty';
  overtimeMinutes: number;
  // Only set (by the History endpoint) when status is 'leave' — the
  // specific leave type name (e.g. "Annual Leave") covering that date.
  leaveTypeName?: string | null;
}

export interface AttendanceRegularization {
  id: string;
  attendanceId: string;
  employeeId: string;
  requestedStatus: Attendance['status'];
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approverId: string | null;
  // The employee's own claimed check-in/check-out instant for this date —
  // optional. Once approved, this reflects whatever value actually landed
  // on the Attendance row (the approver's own override, if any).
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  attendance?: { id: string; date: string; status: string };
}

interface ListResult<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number };
}

// Own attendance/regularizations only — the backend resolves the caller's
// employeeId from the JWT (attendance:read_own / attendance_regularization:read_own),
// so no employeeId is ever passed from here.
export async function listMyAttendance(params: {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ListResult<Attendance>> {
  const { data } = await apiClient.get<ListResult<Attendance>>('/attendance', { params });
  return data;
}

export async function listMyRegularizations(params: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ListResult<AttendanceRegularization>> {
  const { data } = await apiClient.get<ListResult<AttendanceRegularization>>('/attendance/regularizations', {
    params,
  });
  return data;
}

export async function createRegularization(input: {
  date: string;
  requestedStatus: Attendance['status'];
  reason: string;
  // Optional "HH:MM" — what time the employee actually checked in/out, for
  // when the kiosk never caught it. Applied onto Attendance.checkIn/checkOut
  // once a manager approves the request.
  checkInTime?: string;
  checkOutTime?: string;
}): Promise<AttendanceRegularization> {
  const { data } = await apiClient.post<{ data: AttendanceRegularization }>('/attendance/regularizations', input);
  return data.data;
}
