import type { AuthRole } from '../context/auth-context';

// First matching role wins. HR Manager has no portal yet, so it falls back
// to Company Admin's portal as the closest existing fit until one gets built.
const ROLE_PORTALS: Array<[string, string]> = [
  ['Super Admin', '/super-admin'],
  ['Group Admin', '/group-admin'],
  ['Brand Admin', '/brand-admin'],
  ['Company Admin', '/company-admin'],
  ['Scanner', '/kiosk'],
  ['Employee', '/ess'],
];

const DEFAULT_PORTAL = '/company-admin';

// Per-employee power roles ("Custom Powers – <id>", "… (group)", "… (brand)",
// see Backend utils/customPowerSync.js) are only ever held by an Employee.
// While working in a sibling company at Group level, /auth/me returns ONLY
// those group-level roles — no "Employee" role — so without this the user
// fell through to DEFAULT_PORTAL and landed on the Company Admin portal.
const CUSTOM_POWER_ROLE_PREFIX = 'Custom Powers';

export function getDefaultRoute(roles: AuthRole[]): string {
  for (const [roleName, path] of ROLE_PORTALS) {
    if (roles.some((role) => role.name === roleName)) {
      return path;
    }
  }
  if (roles.some((role) => role.name.startsWith(CUSTOM_POWER_ROLE_PREFIX))) return '/ess';
  return DEFAULT_PORTAL;
}
