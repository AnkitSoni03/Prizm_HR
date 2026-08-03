import { apiClient } from '../client';

export interface FaceEmbeddings {
  front: number[];
  left: number[];
  right: number[];
}

export interface FaceProfileStatus {
  registered: boolean;
  registeredAt: string | null;
  status: 'active' | 'revoked' | null;
}

export async function registerFaceProfile(embeddings: FaceEmbeddings): Promise<{ registered: boolean; registeredAt: string }> {
  const { data } = await apiClient.post('/attendance/face-profile', { embeddings });
  return data.data;
}

export async function getMyFaceProfileStatus(): Promise<FaceProfileStatus> {
  const { data } = await apiClient.get('/attendance/face-profile/me');
  return data.data;
}
