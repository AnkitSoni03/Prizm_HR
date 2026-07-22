import { useAuth } from '../context/auth-context';
import type { AuthRole } from '../context/auth-context';
import { Avatar } from './ui/Avatar';

function scopeLabel(role: AuthRole): string {
  if (role.brandId) return 'Brand-scoped';
  if (role.companyId) return 'Company-scoped';
  if (role.groupId) return 'Group-scoped';
  return 'Platform-wide';
}

// Shared "who am I" view for portals with no dedicated profile record of
// their own (Super Admin, Group Admin, Brand Admin) — unlike ESS, these
// admin users have no linked Employee, so there's nothing richer than the
// account/role info already carried on the JWT (via GET /auth/me) to show.
export function AccountProfileCard() {
  const { user } = useAuth();

  return (
    <div className="max-w-md rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <Avatar src={user?.photoUrl} alt={user?.email} size="lg" />
        <div>
          <p className="text-sm font-semibold text-ink">{user?.email ?? '—'}</p>
          <p className="text-xs text-ink-muted">Account Profile</p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-page px-4 py-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Roles</p>
        {user?.roles.map((role) => (
          <div key={`${role.name}-${role.companyId ?? ''}-${role.brandId ?? ''}`} className="flex items-center justify-between gap-3">
            <span className="text-ink">{role.name}</span>
            <span className="text-xs text-ink-muted">{scopeLabel(role)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
