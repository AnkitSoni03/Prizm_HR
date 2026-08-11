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

// A kiosk account's real password is never recoverable after creation (only
// a bcrypt hash is stored) — this sets a brand-new one rather than
// "revealing" the old one.
export async function resetScannerAccountPassword(id: string, password: string): Promise<void> {
  await apiClient.patch(`/attendance/scanner-accounts/${id}/password`, { password });
}

// Decrypts and returns this kiosk account's current plaintext password, for
// the Kiosk Accounts page's reveal-on-demand eye icon — backed by a
// separate AES-256-GCM-encrypted copy the backend keeps only for Scanner
// accounts (see Backend/src/utils/kioskCredentials.js), a deliberate
// exception to how every other password in this app is stored (one-way
// bcrypt hash, never recoverable). Returns null for an account created
// before this feature existed — reset its password once to enable reveal.
export async function getScannerAccountPassword(id: string): Promise<string | null> {
  const { data } = await apiClient.get<{ data: { password: string | null } }>(
    `/attendance/scanner-accounts/${id}/password`
  );
  return data.data.password;
}
