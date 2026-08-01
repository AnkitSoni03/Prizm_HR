import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { getDefaultRoute } from '../../routes/roleRedirect';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { consumePendingSessionMessage } from '../../api/tokenStore';

interface LocationState {
  from?: { pathname: string };
  activated?: boolean;
  resetSuccess?: boolean;
}

export function LoginPage() {
  const { login, user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Lazily seeded (not a useEffect) so a pending message from a forced
  // logout mid-session (account/company deactivated — see api/client.ts's
  // response interceptor) shows up on the very first render. consumePendingSessionMessage
  // clears it immediately, so it never resurfaces on a later, unrelated
  // visit to this page (including a re-mount after a failed login attempt).
  const [error, setError] = useState<string | null>(() => consumePendingSessionMessage());

  // Only auto-redirect when we landed here because ProtectedRoute bounced an
  // unauthenticated visitor (locationState.from is set for that round-trip
  // only). A bare, direct visit to /login while already authenticated —
  // e.g. a tab closed without logging out, reopened later, restoring the
  // old session via the leftover refresh token — must NOT auto-redirect:
  // that would silently trap the user on the old account with no way to
  // reach the form and sign in as someone else. Instead we fall through and
  // show the form, with a banner explaining who's currently signed in.
  if (isAuthenticated && locationState?.from) {
    const from = locationState.from.pathname;
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const profile = await login(email, password);
      const from = locationState?.from?.pathname ?? getDefaultRoute(profile.roles);
      navigate(from, { replace: true });
    } catch (err) {
      // A deactivated account/company gets a specific, actionable message
      // from the backend (who to contact) — surfaced verbatim. Any other
      // failure (wrong password, unknown email) stays generic, same as
      // before, so a bad guess can't be used to enumerate valid emails.
      const deactivationMessage =
        axios.isAxiosError(err) && err.response?.status === 403 && typeof err.response.data?.error === 'string'
          ? err.response.data.error
          : null;
      setError(deactivationMessage ?? 'Invalid email or password. Please try again.');
    }
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="relative flex shrink-0 items-center justify-center overflow-hidden bg-sidebar px-8 py-12 md:w-1/2 md:py-0">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="relative z-10 flex max-w-sm flex-col items-center gap-4 text-center md:items-start md:text-left">
          <img src="/HRMS%20Logo.png" alt="HRMS logo" className="h-60 w-60 object-contain sm:h-72 sm:w-72" />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-page px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center md:text-left">
            <p className="text-lg font-semibold text-ink">Sign in</p>
            <p className="text-sm text-ink-muted">Enter your credentials to access your account</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            {isAuthenticated && user && (
              <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-ink">
                <span>
                  Already signed in as <span className="font-medium">{user.email}</span>. Sign in
                  below to switch accounts.
                </span>
                <button
                  type="button"
                  onClick={() => navigate(getDefaultRoute(user.roles), { replace: true })}
                  className="shrink-0 whitespace-nowrap font-medium text-primary hover:underline"
                >
                  Continue
                </button>
              </div>
            )}
            {locationState?.activated && (
              <div className="mb-5 flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 px-3 py-2.5 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>Your account is activated. Sign in with your new password.</span>
              </div>
            )}
            {locationState?.resetSuccess && (
              <div className="mb-5 flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 px-3 py-2.5 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>Your password has been reset. Sign in with your new password.</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                    strokeWidth={1.75}
                  />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-xl border border-border py-2 pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-ink">
                    Password
                  </label>
                  <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  icon={Lock}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
                {isLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-ink-muted">
            © {new Date().getFullYear()} Sri Sai Group. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
