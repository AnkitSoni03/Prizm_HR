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
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  hasPermission: (code: string) => boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
