import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { KeyRound, Lock, XCircle } from 'lucide-react';
import { apiClient } from '../../api/client';
import { validatePasswordStrength } from '../../utils/passwordStrength';
import { PasswordInput } from '../../components/ui/PasswordInput';

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

export function ActivatePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordHint = password.length > 0 ? validatePasswordStrength(password) : null;
  const confirmHint =
    confirmPassword.length > 0 && confirmPassword !== password ? 'Passwords do not match.' : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/activate', { token, password });
      navigate('/login', { replace: true, state: { activated: true } });
    } catch (err) {
      setError(
        extractError(err, 'Could not activate this account. The link may be invalid or expired.')
      );
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <XCircle className="mx-auto h-10 w-10 text-danger" strokeWidth={1.5} />
          <h1 className="mt-4 text-base font-semibold text-ink">Invalid activation link</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            This link is missing its activation token. Please use the exact link you were given, or
            ask your administrator to send a new invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-base font-bold text-white">
            HR
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-ink">HRMS</p>
            <p className="text-sm text-ink-muted">Set your password to activate your account</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                New Password
              </label>
              <PasswordInput
                id="password"
                icon={Lock}
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="mt-1 text-xs text-ink-muted">
                At least 8 characters, with a letter and a number.
              </p>
              {passwordHint && <p className="mt-1 text-xs text-danger">{passwordHint}</p>}
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Confirm Password
              </label>
              <PasswordInput
                id="confirm-password"
                icon={KeyRound}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              {confirmHint && <p className="mt-1 text-xs text-danger">{confirmHint}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Activating…' : 'Activate Account'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          © {new Date().getFullYear()} Sri Sai Group. All rights reserved.
        </p>
      </div>
    </div>
  );
}
