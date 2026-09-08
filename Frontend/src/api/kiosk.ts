import { apiClient } from './client';

export interface FaceCheckInResult {
  action: 'check_in' | 'check_out';
  attendance: { id: string; date: string };
  employee: { id: string; name: string; employeeCode: string };
}

export async function createFaceLivenessSession(): Promise<{ sessionId: string }> {
  const { data } = await apiClient.post<{ data: { sessionId: string } }>('/attendance/face-liveness-session', {});
  return data.data;
}

export async function faceCheckIn(
  action: 'checkin' | 'checkout',
  sessionId: string,
  // Set only on the follow-up call after the employee has explicitly
  // confirmed "check out anyway" on a SHIFT_INCOMPLETE rejection — reuses the
  // same liveness session rather than making the employee redo the liveness
  // challenge just to confirm.
  confirmIncompleteShift?: boolean
): Promise<FaceCheckInResult> {
  const { data } = await apiClient.post<{ data: FaceCheckInResult }>('/attendance/face-checkin', {
    action,
    sessionId,
    confirmIncompleteShift,
  });
  return data.data;
}

export async function uploadFaceCapture(attendanceId: string, action: 'checkin' | 'checkout', blob: Blob): Promise<void> {
  const formData = new FormData();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('video', blob, `${action}.${extension}`);
  await apiClient.post(`/attendance/face-capture/${attendanceId}`, formData, { params: { action } });
}
