import { useEffect, useState } from 'react';
import axios from 'axios';
import { startRegistration } from '@simplewebauthn/browser';
import { ShieldCheck } from 'lucide-react';
import { Button } from './ui/Button';
import { useAuth } from '../context/auth-context';
import { getDeviceRegistrationOptions, listMyDevices, registerDevice } from '../api/ess/officeAttendance';

const FINGERPRINT_STORAGE_KEY = 'hrms.deviceFingerprint';

function getOrCreateDeviceFingerprint(): string {
  let fingerprint = localStorage.getItem(FINGERPRINT_STORAGE_KEY);
  if (!fingerprint) {
    fingerprint = crypto.randomUUID();
    localStorage.setItem(FINGERPRINT_STORAGE_KEY, fingerprint);
  }
  return fingerprint;
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

// The one-time passkey setup required before this device can ever be used
// for office kiosk check-in/out (CLAUDE.md rule 6: no fallback punch — a
// device must be registered first, there is no other way in). Only
// meaningful for an account linked to an Employee record.
export function DeviceRegistrationCard() {
  const { user } = useAuth();
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user?.employeeId) return;
    listMyDevices(user.employeeId)
      .then((devices) => setDeviceCount(devices.filter((d) => d.status === 'active').length))
      .catch(() => setDeviceCount(null));
  }, [user?.employeeId]);

  if (!user?.employeeId) return null;

  async function handleRegister() {
    setError(null);
    setSuccess(false);
    setIsRegistering(true);
    try {
      const options = await getDeviceRegistrationOptions(user!.employeeId!);
      const registrationResponse = await startRegistration({ optionsJSON: options });
      await registerDevice(user!.employeeId!, getOrCreateDeviceFingerprint(), registrationResponse);
      setSuccess(true);
      setDeviceCount((count) => (count ?? 0) + 1);
    } catch (err) {
      setError(extractError(err, 'Could not register this device. Please try again.'));
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <div className="max-w-md rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ShieldCheck className="h-4 w-4" strokeWidth={2} />
        Passkey for Office Check-In
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Register this device's fingerprint/Face ID so you can check in and out at an office kiosk.
        Required once before your first check-in — there is no other way to mark attendance.
      </p>

      {deviceCount !== null && deviceCount > 0 && (
        <div className="mt-4 rounded-xl border border-success/20 bg-success/5 px-3 py-2.5 text-sm text-success">
          {deviceCount} device{deviceCount > 1 ? 's' : ''} registered on this account.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-xl border border-success/20 bg-success/5 px-3 py-2.5 text-sm text-success">
          This device is registered.
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button onClick={handleRegister} isLoading={isRegistering}>
          Register this device
        </Button>
      </div>
    </div>
  );
}
