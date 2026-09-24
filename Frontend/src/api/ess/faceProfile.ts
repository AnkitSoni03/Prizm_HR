import { apiClient } from '../client';

export interface FaceProfileStatus {
  registered: boolean;
  registeredAt: string | null;
  status: 'active' | 'revoked' | null;
  photoUrl: string | null;
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
