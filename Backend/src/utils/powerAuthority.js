'use strict';

const { getBrandScope } = require('../middleware/rbac.middleware');

// "No one grants wider than they hold themselves" for per-employee powers
// (config/powerCatalog.js):
//   - Super Admin (no company, no group) and Group Admin (no company, a
//     group) may grant any level. Group Admin's reach is still confined to
//     their own Group's employees by getEmployeeForWrite's groupId check.
//   - A company-scoped caller (Company Admin, HR Manager, Brand Admin, …)
//     may never grant 'group', and must actually hold every permission code
//     in the power's bundle at the requested scope: company-wide for
//     'company'; company-wide or the employee's own Brand for 'brand'. So a
//     Brand Admin (brand-scoped grants) can only ever give Brand level, and
//     nobody can hand out a capability they don't have.
//   - A caller acting in a sibling company via a group-level power
//     (req.auth.homeCompanyId set) can't grant powers at all.
function callerKind(auth) {
  if (auth.homeCompanyId) return 'acting';
  if (!auth.companyId && !auth.groupId) return 'super_admin';
  if (!auth.companyId && auth.groupId) return 'group_admin';
  return 'company';
}

// Returns null if allowed, or a human-readable reason if not. `brandId` is
// the target employee's Brand — pass undefined when there's no specific
// employee yet (catalog listing), in which case 'brand' is allowed if the
// caller holds the codes for at least one Brand.
async function checkGrantAuthority(auth, power, level, brandId) {
  const kind = callerKind(auth);
  if (kind === 'super_admin' || kind === 'group_admin') return null;
  if (kind === 'acting') return 'Powers can only be assigned from your own company';
  if (level === 'group') return 'Only a Group Admin or Super Admin can grant Group level';

  for (const code of power.permissionCodes) {
    // eslint-disable-next-line no-await-in-loop
    const scope = await getBrandScope(auth, code);
    if (!scope.allowed) return `You don't hold "${power.label}" yourself, so you can't grant it`;
    if (scope.companyWide) continue;
    if (level === 'company') return `You can only grant "${power.label}" at Brand level`;
    if (brandId !== undefined && !scope.brandIds.some((id) => String(id) === String(brandId))) {
      return `You can only grant "${power.label}" for your own Brand's employees`;
    }
  }
  return null;
}

async function allowedLevelsForCaller(auth, power) {
  const allowed = [];
  for (const level of power.levels) {
    // eslint-disable-next-line no-await-in-loop
    if ((await checkGrantAuthority(auth, power, level, undefined)) === null) allowed.push(level);
  }
  return allowed;
}

module.exports = { checkGrantAuthority, allowedLevelsForCaller, callerKind };
