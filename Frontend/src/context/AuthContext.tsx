import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient, isTransientError, refreshAccessToken, revokeRefreshToken } from '../api/client';
import {
  clearTokens,
  getTokens,
  registerAuthExpiredHandler,
  setActingCompanyId,
  setTokens,
} from '../api/tokenStore';
import { AuthContext, type AuthContextValue, type AuthUser } from './auth-context';
import { PROBATION_POPUP_KEY_PREFIX } from '../utils/probation';

async function fetchCurrentUser(): Promise<AuthUser> {
  const { data } = await apiClient.get<AuthUser>('/auth/me');
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Separate from isLoading (which LoginPage's submit button also reads):
  // this only covers the one-time app-load session check below, so it
  // can't make the login button flash "Signing in…" before anyone submits.
  // Lazily seeded from whether a refresh token exists, so the effect below
  // never needs to setState synchronously for the no-token case.
  const [isBootstrapping, setIsBootstrapping] = useState(() => !!getTokens().refreshToken);

  const logout = useCallback(() => {
    // Capture before clearing — clearTokens() wipes it from memory/storage,
    // and an explicit logout should actually end the session server-side
    // (revoke the refresh token), not just forget it locally. Best-effort,
    // fire-and-forget: the local logout must succeed even if this fails.
    const { refreshToken } = getTokens();
    clearTokens();
    // So the Probation/Intern reminder pop-up shows again on the next login.
    try {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith(PROBATION_POPUP_KEY_PREFIX))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch {
      /* storage unavailable — nothing to clear */
    }
    setUser(null);
    if (refreshToken) {
      void revokeRefreshToken(refreshToken);
    }
  }, []);

  useEffect(() => {
    registerAuthExpiredHandler(logout);
  }, [logout]);

  // Only the refresh token survives a page reload (see tokenStore.ts) — the
  // access token is always gone. So on app load, redeem the refresh token
  // for a fresh access token first, then fetch the profile. Each refresh
  // issues a new 30-day refresh token, so a user is only asked to log in
  // again after 30 days without opening the app (or an explicit logout /
  // password reset / deactivation).
  //
  // A network failure here (app reopened before the phone's connection is
  // back, server restarting) must NOT log anyone out — keep the token and
  // retry until the server actually answers. Only a definitive rejection
  // (401/403, handled inside refreshAccessToken) ends the session.
  const [isReconnecting, setIsReconnecting] = useState(false);
  useEffect(() => {
    if (!getTokens().refreshToken) return;
    let cancelled = false;
    let timer: number | undefined;
    let attempt = 0;

    const run = async () => {
      timer = undefined;
      try {
        const accessToken = await refreshAccessToken();
        const profile = accessToken ? await fetchCurrentUser() : null;
        if (cancelled) return;
        if (!profile) clearTokens();
        setUser(profile);
        setIsReconnecting(false);
        setIsBootstrapping(false);
      } catch (err) {
        if (cancelled) return;
        if (isTransientError(err) && getTokens().refreshToken) {
          attempt += 1;
          setIsReconnecting(true);
          timer = window.setTimeout(run, Math.min(2000 * attempt, 15000));
          return;
        }
        clearTokens();
        setIsReconnecting(false);
        setIsBootstrapping(false);
      }
    };

    // Connection came back — retry right away instead of waiting out the backoff.
    const onOnline = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        void run();
      }
    };

    window.addEventListener('online', onOnline);
    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Capture whatever session is currently active *before* attempting the
      // new login — e.g. a tab that was closed without logging out leaves a
      // still-valid refresh token behind, which silently restores that old
      // session on next load. If the credentials below belong to a
      // different account, that leftover token must be revoked so the old
      // session can't keep coming back; if login fails, it's left untouched.
      const { refreshToken: staleRefreshToken } = getTokens();
      const { data } = await apiClient.post('/auth/login', { email, password });
      if (staleRefreshToken && staleRefreshToken !== data.refreshToken) {
        void revokeRefreshToken(staleRefreshToken);
      }
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      // A company switch from an earlier session in this tab must never
      // carry over into a fresh login.
      setActingCompanyId(null);
      const profile = await fetchCurrentUser();
      setUser(profile);
      return profile;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const hasPermission = useCallback(
    (code: string) => user?.permissions.includes(code) ?? false,
    [user]
  );

  const refreshUser = useCallback(async () => {
    const profile = await fetchCurrentUser();
    setUser(profile);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      hasPermission,
      refreshUser,
    }),
    [user, isLoading, login, logout, hasPermission, refreshUser]
  );

  // Block on the one-time session check before mounting routes, so
  // ProtectedRoute/LoginPage never see a flash of "logged out" while it's
  // still in flight.
  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <div className="px-4 text-center text-sm text-ink-muted">
          {isReconnecting ? 'Connecting… please check your internet connection.' : 'Loading…'}
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
