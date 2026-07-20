import { apiClient } from '../client';

export interface OdRequest {
  id: string;
  employeeId: string;
  fromDate: string;
  toDate: string;
  purpose: string;
  location: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId: string | null;
}

interface ListResult<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number };
}

// Own OD requests only — resolved server-side from the JWT (od_request:read_own).
export async function listMyOdRequests(params: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ListResult<OdRequest>> {
  const { data } = await apiClient.get<ListResult<OdRequest>>('/attendance/od-requests', { params });
  return data;
}

export async function createOdRequest(input: {
  fromDate: string;
  toDate: string;
  purpose: string;
  location?: string;
}): Promise<OdRequest> {
  const { data } = await apiClient.post<{ data: OdRequest }>('/attendance/od-requests', input);
  return data.data;
}

export async function cancelOdRequest(id: string): Promise<OdRequest> {
  const { data } = await apiClient.patch<{ data: OdRequest }>(`/attendance/od-requests/${id}/cancel`);
  return data.data;
}
