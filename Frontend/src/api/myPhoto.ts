import { apiClient } from './client';

interface PhotoResult {
  photoDownloadUrl: string | null;
}

// Portal-agnostic self-service photo endpoints (same convention as
// api/powers.ts / api/notifications.ts) — resolves to the caller's own
// employeeId server-side (req.auth.employeeId from the JWT), no permission
// code needed. Only meaningful for an account linked to an Employee record
// (see AuthUser.employeeId); a pure admin account with none will get a 400
// if this is ever called for it.
export async function uploadMyPhoto(file: File): Promise<PhotoResult> {
  const formData = new FormData();
  formData.append('photo', file);
  const { data } = await apiClient.post<{ data: { photoDownloadUrl: string | null } }>(
    '/employees/me/photo',
    formData
  );
  return data.data;
}

export async function removeMyPhoto(): Promise<PhotoResult> {
  const { data } = await apiClient.delete<{ data: { photoDownloadUrl: string | null } }>(
    '/employees/me/photo'
  );
  return data.data;
}
