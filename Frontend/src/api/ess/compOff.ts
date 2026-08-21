import { apiClient } from '../client';

export interface CompOffCredit {
  id: string;
  employeeId: string;
  sourceAttendanceId: string;
  earnedDate: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'expired' | 'used';
  approverId: string | null;
  // Null means "earned under a carry-forward Comp-Off Policy — never
  // expires" (see Backend's compOff.service.js).
  expiryDate: string | null;
}

interface ListResult<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number };
}

// Own comp-off credits only (comp_off:read_own). Consuming one happens by
// applying leave against the "CO" leave type — the backend auto-picks the
// oldest approved, unexpired credit, there is no separate "consume" call.
export async function listMyCompOffCredits(params: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ListResult<CompOffCredit>> {
  const { data } = await apiClient.get<ListResult<CompOffCredit>>('/leave/comp-off', { params });
  return data;
}
