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
