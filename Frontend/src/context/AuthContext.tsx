import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient, refreshAccessToken, revokeRefreshToken } from '../api/client';
import { clearTokens, getTokens, registerAuthExpiredHandler, setTokens } from '../api/tokenStore';
import { AuthContext, type AuthContextValue, type AuthUser } from './auth-context';

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
  // for a fresh access token first, then fetch the profile. If the refresh
  // token is missing, expired, or already used, refreshAccessToken clears
  // storage itself and this just resolves to "logged out".
  useEffect(() => {
    if (!getTokens().refreshToken) return;
    refreshAccessToken()
      .then((accessToken) => (accessToken ? fetchCurrentUser() : null))
      .then((profile) => setUser(profile ?? null))
      .catch(() => clearTokens())
      .finally(() => setIsBootstrapping(false));
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
        <div className="text-sm text-ink-muted">Loading…</div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
