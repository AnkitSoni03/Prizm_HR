import { apiClient } from './client';

export interface FaceCheckInResult {
  action: 'check_in' | 'check_out';
  attendance: { id: string; date: string };
  employee: { id: string; name: string; employeeCode: string };
  location: { id: string; name: string };
}

export interface KioskLocationOption {
  id: string;
  name: string;
  isActive: boolean;
  inUse: boolean;
  heldByThisDevice: boolean;
}

// One kiosk account is shared by every device in the group, so the User id
// alone cannot tell two devices apart. This opaque id is minted server-side
// the first time this device claims a location and then kept here, so a
// reload (or a browser restart) re-attaches to the same claim instead of
// looking like a second device fighting for the same location.
const KIOSK_SESSION_KEY = 'hrms.kiosk.sessionId';

export function getKioskSessionId(): string | null {
  try {
    return window.localStorage.getItem(KIOSK_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setKioskSessionId(sessionId: string): void {
  try {
    window.localStorage.setItem(KIOSK_SESSION_KEY, sessionId);
  } catch {
    /* private mode / storage disabled — the claim still works for this page view */
  }
}

export function clearKioskSessionId(): void {
  try {
    window.localStorage.removeItem(KIOSK_SESSION_KEY);
  } catch {
    /* no-op */
  }
}

function sessionHeaders(): Record<string, string> {
  const sessionId = getKioskSessionId();
  return sessionId ? { 'X-Kiosk-Session': sessionId } : {};
}

// Only locations no *other* live device is currently signed in as. A
// location this device already holds still comes back, so a reload can
// re-select it.
export async function listKioskLocations(): Promise<KioskLocationOption[]> {
  const { data } = await apiClient.get<{ data: KioskLocationOption[] }>('/attendance/kiosk/locations', {
    headers: sessionHeaders(),
  });
  return data.data;
}

export async function claimKioskLocation(locationId: string): Promise<{ sessionId: string; location: KioskLocationOption }> {
  const { data } = await apiClient.post<{ data: { sessionId: string; location: KioskLocationOption } }>(
    '/attendance/kiosk/locations/claim',
    { locationId },
    { headers: sessionHeaders() }
  );
  setKioskSessionId(data.data.sessionId);
  return data.data;
}

// Renews this device's claim. A 409 means another device took the location
// over (this one slept past the staleness window) and the kiosk must go back
// to the picker rather than keep punching under a location it no longer owns.
export async function heartbeatKioskLocation(): Promise<KioskLocationOption> {
  const { data } = await apiClient.post<{ data: KioskLocationOption }>(
    '/attendance/kiosk/locations/heartbeat',
    {},
    { headers: sessionHeaders() }
  );
  return data.data;
}

export async function releaseKioskLocation(): Promise<void> {
  await apiClient.post('/attendance/kiosk/locations/release', {}, { headers: sessionHeaders() });
}

export async function createFaceLivenessSession(): Promise<{ sessionId: string }> {
  const { data } = await apiClient.post<{ data: { sessionId: string } }>('/attendance/face-liveness-session', {});
  return data.data;
}

export async function faceCheckIn(
  action: 'checkin' | 'checkout',
  sessionId: string,
  // Set only on the follow-up call after the employee has explicitly
  // confirmed "check out anyway" on a SHIFT_INCOMPLETE rejection — reuses the
  // same liveness session rather than making the employee redo the liveness
  // challenge just to confirm.
  confirmIncompleteShift?: boolean
): Promise<FaceCheckInResult> {
  const { data } = await apiClient.post<{ data: FaceCheckInResult }>(
    '/attendance/face-checkin',
    { action, sessionId, confirmIncompleteShift },
    { headers: sessionHeaders() }
  );
  return data.data;
}

export async function uploadFaceCapture(attendanceId: string, action: 'checkin' | 'checkout', blob: Blob): Promise<void> {
  const formData = new FormData();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('video', blob, `${action}.${extension}`);
  await apiClient.post(`/attendance/face-capture/${attendanceId}`, formData, {
    params: { action },
    headers: sessionHeaders(),
  });
}
