import { apiClient } from './client';

export interface OfficeTokenResult {
  officeToken: string;
  expiresAt: string;
}

export async function issueOfficeToken(): Promise<OfficeTokenResult> {
  const { data } = await apiClient.get<{ data: OfficeTokenResult }>('/attendance/office-token');
  return data.data;
}

// EventSource can't send an Authorization header, so the SSE stream is
// authenticated with a short-lived, single-use ticket instead of the
// kiosk's real JWT (see officeToken.js/officeKiosk.service.js on the
// backend) — minted via a normal authenticated call, then appended as a
// query param on the stream URL itself.
export async function issueSseTicket(): Promise<string> {
  const { data } = await apiClient.post<{ data: { ticket: string } }>('/attendance/office-video-stream/ticket', {});
  return data.data.ticket;
}

export function videoStreamUrl(ticket: string): string {
  const base = apiClient.defaults.baseURL ?? '';
  return `${base}/attendance/office-video-stream?ticket=${encodeURIComponent(ticket)}`;
}

export async function uploadOfficeVideo(
  attendanceId: string,
  action: 'checkin' | 'checkout',
  blob: Blob
): Promise<void> {
  const formData = new FormData();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('video', blob, `${action}.${extension}`);
  await apiClient.post(`/attendance/office-video/${attendanceId}`, formData, { params: { action } });
}
