import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { clearTokens, getTokens, notifyAuthExpired, setPendingSessionMessage, setTokens } from './tokenStore';

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

// Only one refresh call should ever be in flight — concurrent 401s share
// this promise instead of each firing their own /auth/refresh request.
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getTokens();
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post(`${apiClient.defaults.baseURL}/auth/refresh`, {
      refreshToken,
    });
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken as string;
  } catch {
    clearTokens();
    notifyAuthExpired();
    return null;
  }
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

    if (error.response?.status !== 401 || !config || config._retried || isAuthFreePath(config.url)) {
      throw error;
    }

    config._retried = true;
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });

    const newAccessToken = await refreshPromise;
    if (!newAccessToken) {
      throw error;
    }

    config.headers.Authorization = `Bearer ${newAccessToken}`;
    return apiClient(config);
  }
);
