import { apiClient } from './client';

export type LivenessChallenge = 'blink' | 'turn_left' | 'turn_right';

export interface LivenessFrame {
  t: number;
  ear: number;
  yaw: number;
}

export interface FaceCheckInResult {
  action: 'check_in' | 'check_out';
  attendance: { id: string; date: string };
  employee: { id: string; name: string; employeeCode: string };
}

export async function faceCheckIn(
  action: 'checkin' | 'checkout',
  embedding: number[],
  liveness: { challenge: LivenessChallenge; frames: LivenessFrame[] }
): Promise<FaceCheckInResult> {
  const { data } = await apiClient.post<{ data: FaceCheckInResult }>('/attendance/face-checkin', {
    action,
    embedding,
    liveness,
  });
  return data.data;
}

export async function uploadFaceCapture(attendanceId: string, action: 'checkin' | 'checkout', blob: Blob): Promise<void> {
  const formData = new FormData();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('video', blob, `${action}.${extension}`);
  await apiClient.post(`/attendance/face-capture/${attendanceId}`, formData, { params: { action } });
}
