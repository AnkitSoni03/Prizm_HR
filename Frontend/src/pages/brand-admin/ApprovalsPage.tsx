import { ApprovalsPage as CompanyAdminApprovalsPage } from '../company-admin/ApprovalsPage';
import { useAuth } from '../../context/auth-context';

// Brand Admin has the full leave_request/od_request/attendance_regularization/
// comp_off approve+reject set (see 20260711100000-seed-group-brand-admin-
// portal-permissions.js and the base seeder), scoped to their own brandId —
// reusing Company Admin's ApprovalsPage with that one extra param is exact
// reuse, not a stripped-down variant.
export function ApprovalsPage() {
  const { user } = useAuth();
  const brandId = user?.roles.find((role) => role.name === 'Brand Admin')?.brandId ?? undefined;

  if (!brandId) {
    return <p className="text-sm text-danger">No Brand is linked to this account.</p>;
  }

  return <CompanyAdminApprovalsPage extraParams={{ brandId }} />;
}
