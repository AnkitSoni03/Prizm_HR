import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  clearTokens,
  getActingCompanyId,
  getSessionEpoch,
  getTokens,
  notifyAuthExpired,
  setActingCompanyId,
  setPendingSessionMessage,
  setTokens,
} from './tokenStore';

// Set on a 403 by requireAuth (Backend/src/middleware/auth.middleware.js)
// when the caller's own account, or their whole company, was deactivated
// mid-session — distinct from an ordinary permission-denied 403 (which
// should NOT force a logout, just show "you can't do that").
const DEACTIVATION_ERROR_CODES = new Set(['ACCOUNT_DEACTIVATED', 'COMPANY_DEACTIVATED']);

const AUTH_FREE_PATHS = ['/auth/login', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000',
  headers: { 'Content-Type': 'application/json' },
});

function isAuthFreePath(url?: string): boolean {
  return !!url && AUTH_FREE_PATHS.some((path) => url.startsWith(path));
}

apiClient.interceptors.request.use((config) => {
  const { accessToken } = getTokens();
  if (accessToken && !isAuthFreePath(config.url)) {
    config.headers.Authorization = `Bearer ${accessToken}`;
    const actingCompanyId = getActingCompanyId();
    if (actingCompanyId) config.headers['X-Acting-Company-Id'] = actingCompanyId;
  }
  // The shared instance defaults every request to Content-Type:
  // application/json — wrong for a multipart file upload, and setting
  // 'multipart/form-data' explicitly is *also* wrong (it needs a boundary
  // parameter the browser generates itself). Deleting the header here lets
  // the browser's fetch/XHR layer set the correct
  // "multipart/form-data; boundary=..." header when the body is FormData.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

// Only one refresh call should ever be in flight for a given session —
// concurrent callers (a 401 retry, AND AuthContext's app-load bootstrap
// effect, which React 18 StrictMode double-invokes in dev) share this
// promise instead of each firing their own /auth/refresh request. Two
// concurrent requests using the same (rotating, single-use) refresh token
// would otherwise race: whichever the backend sees second gets rejected as
// already-revoked, which used to wipe out the tokens the first one had just
// set. Scoped by session epoch (see tokenStore.ts) rather than just "one
// promise ever" — a fresh login/logout must be able to start its own
// refresh cycle rather than piggyback on a stale one from the session that
// just ended.
let refreshPromise: Promise<string | null> | null = null;
let refreshPromiseEpoch = -1;

export async function refreshAccessToken(): Promise<string | null> {
  const epoch = getSessionEpoch();
  if (refreshPromise && refreshPromiseEpoch === epoch) {
    return refreshPromise;
  }

  refreshPromiseEpoch = epoch;
  refreshPromise = doRefresh(epoch).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function doRefresh(epochAtStart: number): Promise<string | null> {
  const { refreshToken } = getTokens();
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post(`${apiClient.defaults.baseURL}/auth/refresh`, {
      refreshToken,
    });
    // A logout, or a login as someone else, happened while this request was
    // in flight — the response belongs to a session that's no longer
    // current. Applying it now would silently overwrite whatever the newer
    // session already set. Just drop it.
    if (getSessionEpoch() !== epochAtStart) return null;
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken as string;
  } catch (err) {
    if (getSessionEpoch() !== epochAtStart) return null;
    // No connection yet (phone just woke up / app reopened), a timeout, or
    // the server being down/restarting says nothing about the token itself.
    // Keep it and let the caller retry — wiping it here is what used to log
    // people out every time they reopened the app on a flaky network. Only
    // the server explicitly rejecting the token ends the session.
    if (isTransientError(err)) throw err;
    clearTokens();
    notifyAuthExpired();
    return null;
  }
}

// True for failures that say nothing about whether the session is still
// valid: no response at all (offline, DNS, timeout, CORS on a crashed
// server) or a server-side/rate-limit status. A 4xx like 401/403 is the
// server's actual verdict and is NOT transient.
export function isTransientError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  if (status === undefined) return true;
  return status >= 500 || status === 408 || status === 429;
}

// Best-effort revoke of a session being replaced by a fresh login (see
// AuthContext's login()) — an already-expired/invalid token is fine to
// ignore, so failures are swallowed rather than surfaced to the caller.
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await axios.post(`${apiClient.defaults.baseURL}/auth/logout`, { refreshToken });
  } catch {
    // ignore
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    // Mid-session deactivation: unlike an ordinary 401 (expired access
    // token — recoverable via refresh below) or an ordinary 403
    // (permission-denied — the caller stays logged in, just can't do that
    // one thing), this means the session itself is no longer valid and
    // won't become valid again by refreshing. Force a logout and hand the
    // specific reason to the login screen. Skipped for /auth/login itself —
    // that request has no session to log out of, and LoginPage shows the
    // same message inline via its own catch block instead.
    if (
      error.response?.status === 403 &&
      config &&
      !isAuthFreePath(config.url) &&
      DEACTIVATION_ERROR_CODES.has((error.response.data as { code?: string } | undefined)?.code ?? '')
    ) {
      const message = (error.response.data as { error?: string } | undefined)?.error;
      if (message) setPendingSessionMessage(message);
      clearTokens();
      notifyAuthExpired();
      throw error;
    }

    // The group-level power this tab was using to work in another company
    // is gone (revoked or re-levelled) — drop back to the home company.
    if (
      error.response?.status === 403 &&
      (error.response.data as { code?: string } | undefined)?.code === 'ACTING_COMPANY_FORBIDDEN' &&
      getActingCompanyId()
    ) {
      setActingCompanyId(null);
      window.location.reload();
      throw error;
    }

    if (error.response?.status !== 401 || !config || config._retried || isAuthFreePath(config.url)) {
      throw error;
    }

    config._retried = true;
    // A transient refresh failure throws the network error itself (not this
    // 401): this one request fails, but the stored refresh token stays
    // intact, and callers that retry on transient errors see it as such.
    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) {
      throw error;
    }

    config.headers.Authorization = `Bearer ${newAccessToken}`;
    return apiClient(config);
  }
);
