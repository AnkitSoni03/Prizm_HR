import { apiClient } from '../client';

export interface HolidayAuditUser {
  id: string;
  email: string;
  employee?: { name: string | null } | null;
}

export interface Holiday {
  id: string;
  companyId: string;
  brandId: string | null;
  date: string;
  name: string;
  type: 'public' | 'optional';
  // Only meaningful on the Company Admin/HR-facing page — the ESS "Yearly
  // Holidays" page reads the same rows but doesn't render these.
  creator?: HolidayAuditUser | null;
  updater?: HolidayAuditUser | null;
}

export interface HolidayListResult {
  data: Holiday[];
  pagination: { total: number; limit: number; offset: number };
}

export async function listHolidays(
  params: { limit?: number; offset?: number; from?: string; to?: string } = {}
): Promise<HolidayListResult> {
  const { data } = await apiClient.get<HolidayListResult>('/leave/holidays', {
    params: { limit: 100, ...params },
  });
  return data;
}

export async function createHoliday(input: {
  date: string;
  name: string;
  type: 'public' | 'optional';
}): Promise<Holiday> {
  const { data } = await apiClient.post<{ data: Holiday }>('/leave/holidays', input);
  return data.data;
}

export async function updateHoliday(
  id: string,
  input: { date?: string; name?: string; type?: 'public' | 'optional' }
): Promise<Holiday> {
  const { data } = await apiClient.patch<{ data: Holiday }>(`/leave/holidays/${id}`, input);
  return data.data;
}

export async function deleteHoliday(id: string): Promise<void> {
  await apiClient.delete(`/leave/holidays/${id}`);
}

export function holidayAuditName(user: HolidayAuditUser | null | undefined): string | null {
  if (!user) return null;
  return user.employee?.name ?? user.email;
}
