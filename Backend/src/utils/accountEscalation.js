'use strict';

const db = require('../models');
const { runWithTenant } = require('../config/tenant-context');

// Tells a deactivated user exactly who can reactivate them, following
// CLAUDE.md's fixed tenancy hierarchy (Super Admin > Group > Company >
// Brand > Employees): an Employee escalates to their own Brand/Company
// Admin; a Brand Admin escalates to their Company Admin; a Company
// Admin/HR Manager escalates to their Group Admin if one exists, otherwise
// the Super Admin; a Group Admin escalates to the Super Admin. Wrapped in
// runWithTenant({ companyId: null }) for the system-level lookups (Role,
// cross-company UserRole) so this stays correct even if it's ever called
// from within an active tenant context — see CLAUDE.md's "tenant-scope hook
// + system-level rows" gotcha.
async function resolveEscalationContact(user) {
  if (user.employeeId) {
    const employee = await db.Employee.findByPk(user.employeeId, { attributes: ['brandId'] });
    return employee && employee.brandId ? 'your Brand Admin' : 'your Company Admin';
  }

  if (user.companyId) {
    // Brand Admin vs Company Admin/HR Manager: distinguished by their own
    // UserRole grant (a Brand Admin's is brand-scoped).
    const userRole = await runWithTenant({ companyId: null }, () =>
      db.UserRole.findOne({
        where: { userId: user.id, companyId: user.companyId },
        include: [{ model: db.Role, as: 'role', attributes: ['name'] }],
      })
    );
    if (userRole?.role?.name === 'Brand Admin') {
      return 'your Company Admin';
    }

    // Company Admin / HR Manager tier — escalate to an active Group Admin if
    // their company's Group actually has one (a Group isn't required to
    // have an admin invited), otherwise straight to the Super Admin.
    const company = await db.Company.findByPk(user.companyId, { attributes: ['groupId'] });
    if (company?.groupId) {
      const groupAdminGrant = await runWithTenant({ companyId: null }, () =>
        db.UserRole.findOne({
          where: { groupId: company.groupId },
          include: [
            { model: db.Role, as: 'role', where: { name: 'Group Admin' }, attributes: [] },
            { model: db.User, as: 'user', where: { isActive: true, status: 'active' }, attributes: [] },
          ],
        })
      );
      if (groupAdminGrant) return 'your Group Admin';
    }
    return 'the Super Admin';
  }

  if (user.groupId) return 'the Super Admin';

  // companyId and groupId both null means Super Admin — the top of the
  // hierarchy, with no toggle to deactivate one today. Kept as a safe
  // fallback rather than assumed unreachable.
  return 'the platform administrator';
}

module.exports = { resolveEscalationContact };
