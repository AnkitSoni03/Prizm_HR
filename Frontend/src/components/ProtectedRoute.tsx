import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/auth-context';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: string;
  // Passes when the caller holds ANY of these — for a page reachable through
  // more than one grant (e.g. Team Approvals: a manager's *_reports codes at
  // home, or only a power's company-wide codes while working in a sibling
  // company at Group level).
  anyPermission?: string[];
}

export function ProtectedRoute({ children, permission, anyPermission }: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const missing =
    (permission && !hasPermission(permission)) ||
    (anyPermission && anyPermission.length > 0 && !anyPermission.some((code) => hasPermission(code)));
  if (missing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="h-8 w-8 text-danger" strokeWidth={1.75} />
          <h1 className="text-base font-semibold text-ink">Access restricted</h1>
          <p className="text-sm text-ink-muted">
            You don&apos;t have permission (
            <code className="text-xs">{permission ?? anyPermission?.join(' / ')}</code>) to view this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
