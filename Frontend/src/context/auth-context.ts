import { createContext, useContext } from 'react';

export interface AuthRole {
  name: string;
  companyId: string | null;
  groupId: string | null;
  brandId: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  employeeId: string | null;
  roles: AuthRole[];
  permissions: string[];
  // null for Super Admin (no company of their own); otherwise whether the
  // caller's company operates with Brands or directly at the Company level.
  companyUsesBrands: boolean | null;
  // Resolved from the caller's own linked Employee record (employeeId), if
  // any — most pure admin accounts have none and this is simply null,
  // falling back to the generic avatar icon.
  photoUrl: string | null;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  hasPermission: (code: string) => boolean;
  // Re-fetches GET /auth/me and updates the cached user — used after a
  // self-service change that /auth/me reflects but the login flow already
  // cached (e.g. uploading your own profile photo, so the Topbar avatar
  // updates without a full page reload).
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
