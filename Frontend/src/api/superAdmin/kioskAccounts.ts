import { apiClient } from '../client';

export interface KioskLocation {
  id: string;
  name: string;
  isActive: boolean;
  /** A live device is currently signed in as this location. */
  inUse: boolean;
  heldByThisDevice: boolean;
}

export interface KioskAccount {
  id: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  groupId: string;
  locations: KioskLocation[];
}

// Kiosk (Scanner) accounts are group-level machine accounts and are
// provisioned by Super Admin only — the backend gates these routes with
// requireSuperAdmin (structural: company_id AND group_id both NULL), not a
// permission code, so no Company/Brand/Group Admin can reach them at all.
export async function listKioskAccounts(groupId: string): Promise<KioskAccount[]> {
  const { data } = await apiClient.get<{ data: KioskAccount[] }>('/attendance/scanner-accounts', {
    params: { groupId },
  });
  return data.data;
}

export async function createKioskAccount(input: {
  groupId: string;
  email: string;
  password: string;
  locations: string[];
}): Promise<KioskAccount> {
  const { data } = await apiClient.post<{ data: KioskAccount }>('/attendance/scanner-accounts', input);
  return data.data;
}

// Replaces the whole location set. A removed location is soft-deleted
// server-side (historical attendance rows point at it) and any device
// currently running as it is kicked back to the picker.
export async function updateKioskAccountLocations(
  id: string,
  input: { groupId: string; locations: string[] }
): Promise<KioskAccount> {
  const { data } = await apiClient.patch<{ data: KioskAccount }>(
    `/attendance/scanner-accounts/${id}/locations`,
    input
  );
  return data.data;
}

export async function resetKioskAccountPassword(
  id: string,
  input: { groupId: string; password: string }
): Promise<void> {
  await apiClient.patch(`/attendance/scanner-accounts/${id}/password`, input);
}

// Decrypts and returns this kiosk account's current plaintext password, for
// the reveal-on-demand eye icon — backed by a separate AES-256-GCM-encrypted
// copy the backend keeps only for kiosk accounts (see
// Backend/src/utils/kioskCredentials.js), a deliberate exception to how
// every other password in this app is stored (one-way bcrypt hash, never
// recoverable). Returns null for an account that never got one — reset its
// password once to enable reveal.
export async function getKioskAccountPassword(id: string, groupId: string): Promise<string | null> {
  const { data } = await apiClient.get<{ data: { password: string | null } }>(
    `/attendance/scanner-accounts/${id}/password`,
    { params: { groupId } }
  );
  return data.data.password;
}

export async function deleteKioskAccount(id: string, groupId: string): Promise<void> {
  await apiClient.delete(`/attendance/scanner-accounts/${id}`, { params: { groupId } });
}
