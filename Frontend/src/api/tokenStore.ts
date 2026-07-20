interface Tokens {
  accessToken: string | null;
  refreshToken: string | null;
}

// Only the refresh token is persisted. It's a rotating, single-use, opaque
// token (server revokes it the moment it's redeemed via /auth/refresh), so
// a page reload can restore a session from it without keeping the more
// powerful, longer-reach access token sitting in storage. The access token
// itself stays in-memory only and is re-derived from a call to /auth/refresh
// on app boot (see AuthContext's bootstrap effect).
const REFRESH_TOKEN_STORAGE_KEY = 'hrms.refreshToken';

let tokens: Tokens = {
  accessToken: null,
  refreshToken: localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY),
};
let authExpiredHandler: (() => void) | null = null;

export function getTokens(): Tokens {
  return tokens;
}

export function setTokens(next: Tokens): void {
  tokens = next;
  if (next.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, next.refreshToken);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}

export function clearTokens(): void {
  tokens = { accessToken: null, refreshToken: null };
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function registerAuthExpiredHandler(handler: () => void): void {
  authExpiredHandler = handler;
}

export function notifyAuthExpired(): void {
  authExpiredHandler?.();
}
