import { apiClient } from '../client';
import type { Shift, ShiftRoster } from '../tenancy';

export interface EmployeeShiftAssignment {
  id: string;
  employeeId: string;
  shiftId: string;
  effectiveFrom: string;
  shift?: Shift;
}

// Standing default-shift assignments for one employee (employee_shifts) —
// the row with the latest effectiveFrom <= a given date is that employee's
// default shift as of that date, and it stays in effect (no per-day entry
// needed) until a newer effectiveFrom row is assigned.
export async function listEmployeeShiftAssignments(employeeId: string): Promise<EmployeeShiftAssignment[]> {
  const { data } = await apiClient.get<{ data: EmployeeShiftAssignment[] }>(
    `/attendance/employees/${employeeId}/shifts`
  );
  return data.data;
}

export async function assignEmployeeShift(
  employeeId: string,
  input: { shiftId: string; effectiveFrom: string }
): Promise<EmployeeShiftAssignment> {
  const { data } = await apiClient.post<{ data: EmployeeShiftAssignment }>(
    `/attendance/employees/${employeeId}/shifts`,
    input
  );
  return data.data;
}

export async function deleteEmployeeShiftAssignment(employeeId: string, id: string): Promise<void> {
  await apiClient.delete(`/attendance/employees/${employeeId}/shifts/${id}`);
}

export async function listShifts(): Promise<Shift[]> {
  const { data } = await apiClient.get<{ data: Shift[] }>('/attendance/shifts', { params: { limit: 100 } });
  return data.data;
}

export async function createShift(input: {
  name: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  weeklyOffDays: number[];
}): Promise<Shift> {
  const { data } = await apiClient.post<{ data: Shift }>('/attendance/shifts', input);
  return data.data;
}

export async function updateShift(
  id: string,
  input: {
    name: string;
    startTime: string;
    endTime: string;
    isNightShift: boolean;
    weeklyOffDays: number[];
  }
): Promise<Shift> {
  const { data } = await apiClient.patch<{ data: Shift }>(`/attendance/shifts/${id}`, input);
  return data.data;
}

export async function deleteShift(id: string): Promise<void> {
  await apiClient.delete(`/attendance/shifts/${id}`);
}

export async function listShiftRosters(params: {
  brandId?: string;
  employeeId?: string;
  rosterDate?: string;
}): Promise<ShiftRoster[]> {
  const { data } = await apiClient.get<{ data: ShiftRoster[] }>('/attendance/rosters', {
    params: { ...params, limit: 100 },
  });
  return data.data;
}

export async function createShiftRoster(input: {
  employeeId?: string | null;
  shiftId: string;
  brandId?: string;
  rosterDate: string;
}): Promise<ShiftRoster> {
  const { data } = await apiClient.post<{ data: ShiftRoster }>('/attendance/rosters', input);
  return data.data;
}

export async function updateShiftRoster(
  id: string,
  input: Partial<{ employeeId: string | null; shiftId: string; status: 'draft' | 'published' }>
): Promise<ShiftRoster> {
  const { data } = await apiClient.patch<{ data: ShiftRoster }>(`/attendance/rosters/${id}`, input);
  return data.data;
}

export async function deleteShiftRoster(id: string): Promise<void> {
  await apiClient.delete(`/attendance/rosters/${id}`);
}

export interface BulkAssignResult {
  employeeId: string;
  status: 'created' | 'skipped';
  reason?: string;
}

// Creates one roster entry per employee for the same shift+date in a single
// call, defaulting to 'published' (every employeeId here is a real,
// already-picked employee — unlike the single-create endpoint, which starts
// 'draft' to support the unassigned-slot tenancy-gate case). Per-employee
// failures (duplicate for that date, wrong brand) come back as 'skipped'
// rows rather than failing the whole batch.
export async function bulkCreateShiftRoster(input: {
  employeeIds: string[];
  shiftId: string;
  brandId?: string;
  rosterDate: string;
  status?: 'draft' | 'published';
}): Promise<BulkAssignResult[]> {
  const { data } = await apiClient.post<{ data: BulkAssignResult[] }>('/attendance/rosters/bulk', input);
  return data.data;
}

// Assigns the same default shift (employee_shifts) to several employees at
// once. Per-employee failures come back as 'skipped' rows, same shape as
// bulkCreateShiftRoster.
export async function bulkAssignEmployeeShift(input: {
  employeeIds: string[];
  shiftId: string;
  effectiveFrom: string;
}): Promise<BulkAssignResult[]> {
  const { data } = await apiClient.post<{ data: BulkAssignResult[] }>('/attendance/employee-shifts/bulk', input);
  return data.data;
}
