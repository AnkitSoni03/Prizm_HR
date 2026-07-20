import { apiClient } from '../client';
import type { Shift, ShiftRoster } from '../tenancy';

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
