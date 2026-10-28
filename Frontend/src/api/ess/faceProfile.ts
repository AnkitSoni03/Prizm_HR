import { apiClient } from '../client';

export interface FaceProfileStatus {
  registered: boolean;
  registeredAt: string | null;
  status: 'active' | 'revoked' | null;
  photoUrl: string | null;
  // Registered faces are locked; an admin turns this on to allow one retake.
  retakeAllowed: boolean;
  retakeRequestedAt: string | null;
}

export async function registerFaceProfile(photo: Blob): Promise<{ registered: boolean; registeredAt: string; photoUrl: string | null }> {
  const formData = new FormData();
  formData.append('photo', photo, 'face.jpg');
  const { data } = await apiClient.post('/attendance/face-profile', formData);
  return data.data;
}

export async function getMyFaceProfileStatus(): Promise<FaceProfileStatus> {
  const { data } = await apiClient.get('/attendance/face-profile/me');
  return data.data;
}

// Admin view (read-only) of another employee's registered Face ID photo.
export async function getEmployeeFaceProfileStatus(employeeId: string): Promise<FaceProfileStatus> {
  const { data } = await apiClient.get(`/employees/${employeeId}/face-photo`);
  return data.data;
}

// Employee asks an admin to allow re-registering their face.
export async function requestFaceRetake(): Promise<FaceProfileStatus> {
  const { data } = await apiClient.post('/attendance/face-profile/retake-request');
  return data.data;
}

// Admin toggle in the employee popup.
export async function setEmployeeFaceRetake(employeeId: string, allowed: boolean): Promise<FaceProfileStatus> {
  const { data } = await apiClient.patch(`/employees/${employeeId}/face-retake`, { allowed });
  return data.data;
}
