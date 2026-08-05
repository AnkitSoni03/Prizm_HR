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
  // Inclusive end of the holiday's date range — equal to `date` for a
  // plain single-day holiday.
  endDate: string;
  name: string;
  // Still present on the API response (every holiday defaults to 'public'
  // server-side) but no longer surfaced anywhere in the UI — every holiday
  // is a day off for everyone, so the public/optional distinction wasn't
  // meaningful in practice.
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

// toDate is optional — when set (and later than date), the holiday's
// endDate covers that whole range as a single row, so a multi-day
// festival/shutdown shows up on every one of its days for employees under
// one entry, not a plain one-day holiday repeated.
export async function createHoliday(input: { date: string; toDate?: string; name: string }): Promise<Holiday> {
  const { data } = await apiClient.post<{ data: Holiday }>('/leave/holidays', input);
  return data.data;
}

export async function updateHoliday(
  id: string,
  input: { date?: string; toDate?: string; name?: string }
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
