import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { KeyRound, Lock } from 'lucide-react';
import { Button } from './ui/Button';
import { changePassword } from '../api/auth';
import { validatePasswordStrength } from '../utils/passwordStrength';
import { PasswordInput } from './ui/PasswordInput';

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

// Reused as-is across every portal's Settings page (Super Admin, Group
// Admin, Company Admin, Brand Admin, ESS) — changing your own password
// isn't a resource-scoped RBAC action, so there's nothing portal-specific
// about this beyond where it's mounted.
export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordHint = newPassword.length > 0 ? validatePasswordStrength(newPassword) : null;
  const confirmHint =
    confirmPassword.length > 0 && confirmPassword !== newPassword ? 'Passwords do not match.' : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(extractError(err, 'Could not change your password. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-md rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-ink">Reset Your Password</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Update the password you use to sign in to this account.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {error && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-success/20 bg-success/5 px-3 py-2.5 text-sm text-success">
            Your password has been changed.
          </div>
        )}

        <div>
          <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-ink">
            Current Password
          </label>
          <PasswordInput
            id="current-password"
            icon={Lock}
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-ink">
            New Password
          </label>
          <PasswordInput
            id="new-password"
            icon={Lock}
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <p className="mt-1 text-xs text-ink-muted">
            At least 8 characters, with a letter and a number.
          </p>
          {passwordHint && <p className="mt-1 text-xs text-danger">{passwordHint}</p>}
        </div>

        <div>
          <label htmlFor="confirm-new-password" className="mb-1.5 block text-sm font-medium text-ink">
            Confirm New Password
          </label>
          <PasswordInput
            id="confirm-new-password"
            icon={KeyRound}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          {confirmHint && <p className="mt-1 text-xs text-danger">{confirmHint}</p>}
        </div>

        <div className="flex justify-end">
          <Button type="submit" isLoading={isSubmitting}>
            Change Password
          </Button>
        </div>
      </form>
    </div>
  );
}
