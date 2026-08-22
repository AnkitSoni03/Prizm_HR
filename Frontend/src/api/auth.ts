import { apiClient } from './client';

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>('/auth/forgot-password', { email });
  return data;
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { token, password });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/change-password', { currentPassword, newPassword });
}

interface MyUserPhotoResult {
  photoDownloadUrl: string | null;
}

// Self-service photo for admin-only accounts (no linked Employee — see
// api/myPhoto.ts's /employees/me/photo pair for accounts that do have one).
// Backend rejects this with a 400 for an employee-linked account, directing
// it to the employee endpoint instead (see auth.controller.js).
export async function uploadMyUserPhoto(file: File): Promise<MyUserPhotoResult> {
  const formData = new FormData();
  formData.append('photo', file);
  const { data } = await apiClient.post<{ data: MyUserPhotoResult }>('/auth/me/photo', formData);
  return data.data;
}

export async function removeMyUserPhoto(): Promise<MyUserPhotoResult> {
  const { data } = await apiClient.delete<{ data: MyUserPhotoResult }>('/auth/me/photo');
  return data.data;
}
