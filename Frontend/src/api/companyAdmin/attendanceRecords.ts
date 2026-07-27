import { apiClient } from '../client';

export interface AttendanceRecord {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'present' | 'absent' | 'half_day' | 'leave' | 'holiday' | 'weekoff' | 'on_duty';
  source: 'qr' | 'od' | 'office_kiosk' | null;
  videoObjectPathCheckin: string | null;
  videoObjectPathCheckout: string | null;
  employee?: { id: string; employeeCode: string; name: string | null; brandId: string | null };
}

interface ListResult {
  data: AttendanceRecord[];
  pagination: { total: number; limit: number; offset: number };
}

export async function listAttendanceRecords(params: {
  from?: string;
  to?: string;
  brandId?: string;
  employeeId?: string;
  limit?: number;
  offset?: number;
}): Promise<ListResult> {
  const { data } = await apiClient.get<ListResult>('/attendance', { params });
  return data;
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
