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

export interface FrameBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function faceCheckIn(
  action: 'checkin' | 'checkout',
  embedding: number[],
  liveness: { challenge: LivenessChallenge; frames: LivenessFrame[] },
  frameImage?: string,
  frameBbox?: FrameBbox
): Promise<FaceCheckInResult> {
  const { data } = await apiClient.post<{ data: FaceCheckInResult }>('/attendance/face-checkin', {
    action,
    embedding,
    liveness,
    frameImage,
    frameBbox,
  });
  return data.data;
}

export async function uploadFaceCapture(attendanceId: string, action: 'checkin' | 'checkout', blob: Blob): Promise<void> {
  const formData = new FormData();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('video', blob, `${action}.${extension}`);
  await apiClient.post(`/attendance/face-capture/${attendanceId}`, formData, { params: { action } });
}

// Uploaded only for a blocked (anti-spoof-rejected) attempt — there's no
// attendance row to attach the clip to, so it goes straight to the
// FaceVerificationFlag record instead, for the admin Fraud Attempts review
// page (KioskPage.tsx's runCapture catch branch).
export async function uploadFaceFlagCapture(flagId: string, blob: Blob): Promise<void> {
  const formData = new FormData();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('video', blob, `flag.${extension}`);
  await apiClient.post(`/attendance/face-flags/${flagId}/capture`, formData);
}
