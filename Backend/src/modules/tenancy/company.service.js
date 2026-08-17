'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

// Company has no tenant-scope hook (it IS the tenant boundary — scoping it
// by its own id would be circular), so listing is scoped manually: Super
// Admin sees everything (optionally narrowed by the groupId query param the
// frontend sends when expanding a Group card); a Company Admin only sees
// their own company; a Group Admin sees every company in their Group.
async function listCompanies({ callerCompanyId, callerGroupId, groupId, limit, offset }) {
  let where = {};
  if (callerCompanyId !== null) {
    where = { id: callerCompanyId };
  } else if (callerGroupId !== null) {
    where = { groupId: callerGroupId };
  } else if (groupId) {
    where = { groupId };
  }

  const { rows, count } = await db.Company.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
  });
  return { rows, count };
}

// Same manual scope rules as listCompanies (Company has no tenant-scope
// hook) — a Company Admin/Group Admin fetching a company outside their own
// scope gets a 404, not a 403, matching the rest of this file's pattern of
// silently narrowing rather than leaking existence.
async function getCompanyById({ id, callerCompanyId, callerGroupId }) {
  const company = await db.Company.findByPk(id);
  if (!company) throw new HttpError(404, 'Company not found');

  if (callerCompanyId !== null && company.id !== callerCompanyId) {
    throw new HttpError(404, 'Company not found');
  }
  if (callerCompanyId === null && callerGroupId !== null && company.groupId !== callerGroupId) {
    throw new HttpError(404, 'Company not found');
  }

  return company;
}

// HR can always add more via leave_type:create — these just mean a fresh
// company's Company Admin (or anyone granted the equivalent Power) has
// something to assign a Leave Balance
// against immediately instead of hand-creating them first (see the
// Employee Leave Balance tab in EmployeeDetailModal.tsx). Existing
// companies got the same 5 paid types backfilled by
// 20260712090200-seed-default-leave-types-for-existing-companies.js, and the
// 2 unpaid ones by
// 20260806090000-seed-unpaid-leave-types-for-existing-companies.js.
const DEFAULT_LEAVE_TYPES = [
  { code: 'ANNUAL', name: 'Annual Leave', isPaid: true },
  { code: 'SHORT', name: 'Short Leave', isPaid: true },
  { code: 'SPECIAL', name: 'Special Leave', isPaid: true },
  { code: 'MATERNITY', name: 'Maternity Leave', isPaid: true },
  { code: 'PATERNITY', name: 'Paternity Leave', isPaid: true },
  { code: 'UNPAID', name: 'Unpaid Leave', isPaid: false },
  { code: 'UNPAID_HALF', name: 'Unpaid Half Day', isPaid: false },
];

async function createCompany({ groupId, name, legalName, gstNumber, planId, usesBrands, createdBy }) {
  const group = await db.Group.findByPk(groupId);
  if (!group) throw new HttpError(404, 'Group not found');

  const company = await db.Company.create({
    groupId,
    name,
    legalName,
    gstNumber,
    planId: planId ?? null,
    usesBrands: usesBrands ?? true,
    createdBy,
  });

  const leaveTypes = await db.LeaveType.bulkCreate(
    DEFAULT_LEAVE_TYPES.map((leaveType) => ({
      companyId: company.id,
      code: leaveType.code,
      name: leaveType.name,
      isPaid: leaveType.isPaid,
      carryForward: false,
    }))
  );

  // Short Leave is not opt-in — every employee gets 2/month automatically,
  // reset (not carried forward) each month, whether they use it or not.
  // 'monthly_reset' accrual (see leavePolicy.js) handles the reset; the
  // policy itself must exist for getOrCreateBalance/the monthly cron to ever
  // grant it. Existing companies got this backfilled by
  // 20260813090200-seed-short-leave-policy-for-existing-companies.js.
  const shortLeaveType = leaveTypes.find((leaveType) => leaveType.code === 'SHORT');
  if (shortLeaveType) {
    await db.LeavePolicy.create({
      companyId: company.id,
      leaveTypeId: shortLeaveType.id,
      annualQuota: 2,
      accrual: 'monthly_reset',
      applicableAfterDays: 0,
    });
  }

  return company;
}

async function updateCompany({ id, updates }) {
  const company = await db.Company.findByPk(id);
  if (!company) throw new HttpError(404, 'Company not found');

  const { name, legalName, gstNumber, planId, status, faceAntispoofEnforced } = updates;
  await company.update({
    ...(name !== undefined && { name }),
    ...(legalName !== undefined && { legalName }),
    ...(gstNumber !== undefined && { gstNumber }),
    ...(planId !== undefined && { planId: planId ?? null }),
    ...(status !== undefined && { status }),
    ...(faceAntispoofEnforced !== undefined && { faceAntispoofEnforced }),
  });
  return company;
}

// Mirrors group.service.js's getGroupAdminInvitation. companyId alone isn't
// enough to isolate the Company Admin invite — inviteBrandAdmin and
// inviteEmployeeUser also stamp companyId on their Invitation rows — so this
// additionally filters brandId IS NULL (excludes Brand Admin invites) and
// roleId = the Company Admin role (excludes ESS/Employee invites).
async function getCompanyAdminInvitation(companyId) {
  const role = await db.Role.findOne({ where: { name: 'Company Admin', isSystem: true } });
  if (!role) return null;

  const invitation = await db.Invitation.findOne({
    where: { companyId, brandId: null, roleId: role.id },
    order: [['createdAt', 'DESC']],
  });
  if (!invitation) return null;

  const user = await db.User.findOne({ where: { companyId, email: invitation.email } });
  return { email: invitation.email, status: user ? user.status : 'invited' };
}

// Scope (Super Admin sees everything; Group Admin only their own Group) is
// enforced by company.controller.js::remove before this is ever called —
// same split as updateCompany, kept here dumb/unscoped on purpose.
async function deleteCompany({ id }) {
  const company = await db.Company.findByPk(id);
  if (!company) throw new HttpError(404, 'Company not found');

  // Brand/Employee/User all have paranoid:true, so these counts already
  // exclude soft-deleted rows — "active" for free, same shape as
  // brand.service.js's deleteBrand employee-count guard.
  const [activeBrandCount, activeEmployeeCount, activeUserCount] = await Promise.all([
    db.Brand.count({ where: { companyId: id } }),
    db.Employee.count({ where: { companyId: id } }),
    db.User.count({ where: { companyId: id } }),
  ]);

  const blockers = [];
  if (activeBrandCount > 0) blockers.push(`${activeBrandCount} brand(s)`);
  if (activeEmployeeCount > 0) blockers.push(`${activeEmployeeCount} employee(s)`);
  if (activeUserCount > 0) blockers.push(`${activeUserCount} user(s)`);

  if (blockers.length > 0) {
    throw new HttpError(409, `Cannot delete company: ${blockers.join(', ')} still active`);
  }

  await company.destroy();
}

module.exports = {
  listCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  getCompanyAdminInvitation,
  deleteCompany,
};
