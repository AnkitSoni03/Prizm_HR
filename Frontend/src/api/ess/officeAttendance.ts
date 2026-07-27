import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/browser';
import { apiClient } from '../client';

// Own device/employee only — resolved server-side from the JWT
// (employeeId param on the device routes is the caller's own, and
// verify-office-qr/verify-office-biometric never take an employeeId body
// param at all), same convention as api/ess/attendance.ts.

export async function getDeviceRegistrationOptions(employeeId: string) {
  const { data } = await apiClient.post(`/attendance/employees/${employeeId}/devices/registration-options`, {});
  return data.data;
}

export async function registerDevice(
  employeeId: string,
  deviceFingerprint: string,
  registrationResponse: RegistrationResponseJSON
) {
  const { data } = await apiClient.post(`/attendance/employees/${employeeId}/devices`, {
    deviceFingerprint,
    registrationResponse,
  });
  return data.data;
}

export async function listMyDevices(employeeId: string) {
  const { data } = await apiClient.get(`/attendance/employees/${employeeId}/devices`);
  return data.data as Array<{ id: string; deviceFingerprint: string; status: string; registeredAt: string }>;
}

export interface VerifyOfficeQrResult {
  pendingAttendanceId: string;
  assertionOptions: unknown;
}

export async function verifyOfficeQr(officeToken: string, action: 'checkin' | 'checkout') {
  const { data } = await apiClient.post<{ data: VerifyOfficeQrResult }>('/attendance/verify-office-qr', {
    officeToken,
    action,
  });
  return data.data;
}

export async function verifyOfficeBiometric(
  pendingAttendanceId: string,
  webauthnAssertion: AuthenticationResponseJSON
) {
  const { data } = await apiClient.post('/attendance/verify-office-biometric', {
    pendingAttendanceId,
    webauthnAssertion,
  });
  return data.data as { action: 'check_in' | 'check_out'; attendance: { id: string; date: string } };
}
