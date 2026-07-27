import { apiClient } from '../client';

export interface ScannerAccount {
  id: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  brandId: string | null;
}

// Company-wide by default; a Brand Admin's calls are auto-scoped to their
// own brand server-side (scanner_account:create's brand-scoped grant, same
// convention as employee:create) — no brandId param needed unless the
// caller explicitly wants to target one specific brand.
export async function listScannerAccounts(params: { brandId?: string } = {}): Promise<ScannerAccount[]> {
  const { data } = await apiClient.get<{ data: ScannerAccount[] }>('/attendance/scanner-accounts', { params });
  return data.data;
}

export async function createScannerAccount(input: {
  email: string;
  password: string;
  brandId?: string | null;
}): Promise<ScannerAccount> {
  const { data } = await apiClient.post<{ data: ScannerAccount }>('/attendance/scanner-accounts', input);
  return data.data;
}
