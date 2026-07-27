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

export function getDefaultRoute(roles: AuthRole[]): string {
  for (const [roleName, path] of ROLE_PORTALS) {
    if (roles.some((role) => role.name === roleName)) {
      return path;
    }
  }
  return DEFAULT_PORTAL;
}
