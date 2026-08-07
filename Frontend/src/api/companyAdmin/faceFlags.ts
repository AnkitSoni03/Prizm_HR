import { apiClient } from '../client';

export interface FaceVerificationFlag {
  id: string;
  action: 'checkin' | 'checkout';
  reason: 'anti_spoof_model' | 'screen_artifact';
  blocked: boolean;
  antiSpoofConfidence: number | null;
  screenArtifactScore: number | null;
  reviewed: boolean;
  reviewedAt: string | null;
  createdAt: string;
  employee: { id: string; name: string | null; employeeCode: string } | null;
  kioskUser: { id: string; email: string } | null;
}

interface ListResult<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number };
}

export async function listFaceFlags(params: {
  reviewed?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ListResult<FaceVerificationFlag>> {
  const { data } = await apiClient.get<ListResult<FaceVerificationFlag>>('/attendance/face-flags', { params });
  return data;
}

// Signed URL minted fresh per call, same ~15 min TTL convention as
// getAttendanceVideoUrl — only present when the attempt was actually
// blocked (a soft-flagged attempt's clip lives on its attendance row
// instead; see AttendanceRecordsPage.tsx's own video buttons for that).
export async function getFaceFlagVideoUrl(id: string): Promise<string> {
  const { data } = await apiClient.get<{ data: { url: string } }>(`/attendance/face-flags/${id}/video-url`);
  return data.data.url;
}

export async function markFaceFlagReviewed(id: string): Promise<FaceVerificationFlag> {
  const { data } = await apiClient.patch<{ data: FaceVerificationFlag }>(`/attendance/face-flags/${id}/reviewed`);
  return data.data;
}
