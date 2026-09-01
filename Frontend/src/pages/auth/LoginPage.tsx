import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Download, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth, type AuthRole } from '../../context/auth-context';
import { getDefaultRoute } from '../../routes/roleRedirect';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { consumePendingSessionMessage } from '../../api/tokenStore';
import { usePwaInstall } from '../../hooks/usePwaInstall';

interface LocationState {
  from?: { pathname: string };
  activated?: boolean;
  resetSuccess?: boolean;
}

// locationState.from is wherever *some* session was bounced from — not
// necessarily the account that just signed in. If an Admin's expired session
// left `from: /company-admin/settings` in the location state and a different
// person (an Employee) then logs in on that same /login visit, blindly
// honoring `from` would send them into the Admin's portal instead of their
// own — landing on a page they have no permission for (or, worse, one they
// do, but that belongs to a different role's workflow entirely). Only trust
// `from` when it's inside the portal the newly-authenticated user's own role
// actually owns; otherwise fall back to their real default route.
function resolveRedirectTarget(from: string | undefined, roles: AuthRole[]): string {
  const ownPortal = getDefaultRoute(roles);
  if (from && (from === ownPortal || from.startsWith(`${ownPortal}/`))) {
    return from;
  }
  return ownPortal;
}

export function LoginPage() {
  const { login, user, isAuthenticated, isLoading } = useAuth();
  const { canInstall, promptInstall } = usePwaInstall();
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

  // Any visit to /login while already authenticated — whether ProtectedRoute
  // bounced here, or a tab was closed without logging out and reopened later
  // (restoring the old session via the leftover refresh token) — goes
  // straight back into that session's own portal. Switching accounts is a
  // deliberate action (Logout, then sign in as someone else), not something
  // landing on /login should offer by itself.
  if (isAuthenticated && user) {
    const from = resolveRedirectTarget(locationState?.from?.pathname, user.roles);
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const profile = await login(email, password);
      const from = resolveRedirectTarget(locationState?.from?.pathname, profile.roles);
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
    // The gradient lives on this outer wrapper (mobile only, via max-md:) so
    // it paints continuously behind both sections below — the two sections
    // themselves go transparent on mobile so the gradient shows through
    // instead of being covered by a second, separately-colored solid fill.
    <div className="relative flex min-h-screen flex-col overflow-x-hidden max-md:bg-gradient-to-b max-md:from-sidebar max-md:to-page md:flex-row">
      {/* Mobile-only ambient glow, positioned against the whole page instead
          of being clipped inside the logo section's own box — that per-section
          clipping is what was drawing a hard edge between the two "halves"
          on mobile. Sits behind both sections (z-10 on each below). */}
      <div className="pointer-events-none absolute inset-0 md:hidden">
        <div className="absolute -left-16 -top-10 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -right-20 top-52 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-center overflow-hidden bg-transparent px-8 pb-2 pt-8 sm:py-12 md:w-1/2 md:bg-sidebar md:py-0">
        <div className="pointer-events-none absolute inset-0 hidden md:block">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="relative z-10 flex max-w-sm flex-col items-center gap-4 text-center md:items-start md:text-left">
          <img src="/HRMS%20Logo.png" alt="HRMS logo" className="h-28 w-28 object-contain sm:h-72 sm:w-72" />
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center bg-transparent px-4 pb-12 pt-2 sm:py-12 md:bg-page">
        <div className="w-full max-w-sm">
          {/* This block sits directly on the dark hero gradient on mobile
              (the section around it is bg-transparent there so that gradient
              shows through — see the wrapper's own comment above), but on a
              solid bg-page panel from md: up — needs an explicit light color
              below md rather than the theme-aware ink tokens, which flip
              dark-on-dark and become unreadable in light mode. */}
          <div className="mb-6 text-center sm:mb-8 md:text-left">
            <p className="text-lg font-semibold text-white md:text-ink">Sign in</p>
            <p className="text-sm text-white/70 md:text-ink-muted">Enter your credentials to access your account</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
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

              {canInstall && (
                <button
                  type="button"
                  onClick={() => promptInstall()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold text-ink transition-colors hover:border-primary/40 hover:bg-page"
                >
                  <Download className="h-4 w-4" strokeWidth={1.75} />
                  Install App
                </button>
              )}
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
