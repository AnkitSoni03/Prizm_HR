'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { syncHrTeamRole } = require('../../utils/hrTeamSync');
const { ensureCustomRoleGrant } = require('../../utils/customPowerSync');
const { POWER_KEYS, permissionCodesForKeys } = require('../../config/powerCatalog');
const { buildObjectPath, uploadBuffer, getSignedDownloadUrl, deleteObject } = require('../../utils/gcs');

// photoUrl stores an internal GCS object path (private bucket), same
// convention as company_policies.file_url — never handed to the frontend
// directly. Every response mints a fresh, short-lived v4 signed URL as
// photoDownloadUrl instead. Falls back to null (not a throw) on a GCS
// hiccup so a signing outage never breaks an employee list/read.
async function withPhotoUrl(employee) {
  const plain = employee.toJSON ? employee.toJSON() : employee;
  if (!plain.photoUrl) return { ...plain, photoDownloadUrl: null };
  try {
    return { ...plain, photoDownloadUrl: await getSignedDownloadUrl(plain.photoUrl) };
  } catch (err) {
    console.error('Could not generate signed URL for employee photo:', err);
    return { ...plain, photoDownloadUrl: null };
  }
}

async function assertBelongsToCompany(model, id, companyId, label) {
  const row = await model.findOne({ where: { id, companyId } });
  if (!row) throw new HttpError(400, `${label} not found for this company`);
}

async function listEmployees({ limit, offset, companyId, brandId, departmentId, status, search }) {
  const where = {};
  // Explicit companyId filter for callers whose tenant-scope hook is a
  // no-op (Super Admin's context is null — see CLAUDE.md's "tenant-scope
  // hook + system-level rows" gotcha). A brandId filter used to make this
  // safe by accident (brand ids are globally unique), but a brand-less
  // company's employees have no brandId to filter by, so this can no
  // longer be left implicit.
  if (companyId) where.companyId = companyId;
  if (brandId) where.brandId = brandId;
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;
  // Used by the Super Admin "Users" directory (no companyId filter — every
  // employee on the platform) to search by name or code without the
  // caller needing to know which company/brand an employee belongs to.
  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { employeeCode: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await db.Employee.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
  });
  return { rows: await Promise.all(rows.map(withPhotoUrl)), count };
}

// Includes brand/department/designation/manager names — the Employee role
// has no brand:read/department:read/designation:read of its own (unlike
// Company Admin, which resolves those names client-side from separate list
// endpoints), so the ESS "My Profile" page needs them pre-joined here.
async function getEmployeeForRead(id) {
  const employee = await db.Employee.findOne({
    where: { id },
    include: [
      { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
      { model: db.Department, as: 'department', attributes: ['id', 'name'] },
      { model: db.Designation, as: 'designation', attributes: ['id', 'title'] },
      { model: db.Employee, as: 'manager', attributes: ['id', 'name', 'employeeCode'] },
      // Lets EmployeeDetailModal.tsx pre-check which POWER_CATALOG keys are
      // already assigned when it opens, without a second round trip.
      {
        model: db.Role,
        as: 'customRole',
        attributes: ['id'],
        include: [{ model: db.Permission, as: 'permissions', attributes: ['code'] }],
      },
    ],
  });
  if (!employee) throw new HttpError(404, 'Employee not found');
  return withPhotoUrl(employee);
}

// Mutations don't benefit from the tenant-scope hook (it only covers
// find/count/bulkUpdate/bulkDestroy, not instance .update()/.destroy() or
// .create()), so writes filter by companyId explicitly before touching a row.
// scopedBrandIds mirrors rbac.middleware.js's requirePermission output (same
// shape as holiday.service.js's getHolidayForWrite): null means a
// company-wide grant (Company Admin/HR Manager), an array means the caller
// only holds brand-scoped grants (Brand Admin) — in which case they may only
// touch an employee whose own brandId is one of theirs. Reported as 404
// rather than 403 so a Brand Admin probing another brand's employee ids
// can't distinguish "not found" from "not yours".
async function getEmployeeForWrite({ companyId, id, scopedBrandIds }) {
  const employee = await db.Employee.findOne({ where: { id, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (
    scopedBrandIds &&
    !scopedBrandIds.some((brandId) => String(brandId) === String(employee.brandId))
  ) {
    throw new HttpError(404, 'Employee not found');
  }
  return employee;
}

async function createEmployee({
  companyId,
  name,
  employeeCode,
  brandId,
  departmentId,
  designationId,
  managerId,
  userId,
  dateOfJoining,
  employmentType,
  workState,
}) {
  const company = await db.Company.findByPk(companyId);
  if (!company) throw new HttpError(404, 'Company not found');
  if (company.usesBrands && !brandId) {
    throw new HttpError(400, 'brandId is required for this company');
  }
  if (!company.usesBrands && brandId) {
    throw new HttpError(400, 'This company operates directly and does not use Brands');
  }

  if (brandId) await assertBelongsToCompany(db.Brand, brandId, companyId, 'Brand');
  await assertBelongsToCompany(db.Department, departmentId, companyId, 'Department');
  if (designationId) await assertBelongsToCompany(db.Designation, designationId, companyId, 'Designation');
  if (managerId) await assertBelongsToCompany(db.Employee, managerId, companyId, 'Manager');

  // CLAUDE.md: "A Brand cannot receive its first employee until it has
  // >=1 Roster." shift_rosters.employee_id is nullable specifically so an
  // "unassigned slot" roster row can be created for a brand before anyone
  // exists to assign it to (see the shift_rosters migration) — that's what
  // this check requires the brand to have at least one of. Brand-optional
  // companies (uses_brands = false) apply the same rule one level up: the
  // Company itself needs >=1 company-level (brand_id null) roster.
  const rosterCount = brandId
    ? await db.ShiftRoster.count({ where: { brandId } })
    : await db.ShiftRoster.count({ where: { companyId, brandId: null } });
  if (rosterCount === 0) {
    throw new HttpError(422, brandId ? 'Brand has no roster; cannot add employees yet' : 'Company has no roster; cannot add employees yet');
  }

  try {
    const employee = await db.Employee.create({
      companyId,
      name,
      employeeCode,
      brandId: brandId || null,
      departmentId,
      designationId: designationId || null,
      managerId: managerId || null,
      userId: userId || null,
      dateOfJoining: dateOfJoining || null,
      employmentType,
      workState: workState || null,
      status: 'onboarding',
    });
    return withPhotoUrl(employee);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'employeeCode already in use for this company');
    }
    throw err;
  }
}

// brandId/departmentId are deliberately excluded here — changing those goes
// through transferEmployee (gated by the separate employee:transfer
// permission) so the two permission codes stay meaningful.
const UPDATABLE_FIELDS = ['designationId', 'employmentType', 'status', 'dateOfJoining', 'managerId', 'userId', 'workState'];

async function updateEmployee({ companyId, id, updates, scopedBrandIds }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds });

  const patch = {};
  for (const field of UPDATABLE_FIELDS) {
    if (updates[field] !== undefined) patch[field] = updates[field];
  }

  if (patch.managerId) await assertBelongsToCompany(db.Employee, patch.managerId, companyId, 'Manager');
  if (patch.designationId) await assertBelongsToCompany(db.Designation, patch.designationId, companyId, 'Designation');

  await employee.update(patch);
  return withPhotoUrl(employee);
}

async function transferEmployee({ companyId, id, brandId, departmentId, scopedBrandIds }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds });

  // A brand-scoped caller (Brand Admin) may only ever move an employee
  // within their own brand — changing brandId at all (including un-assigning
  // to company-level via null) would move the employee out of every brand
  // they're granted, so it's rejected outright rather than silently
  // no-op'd. Department-only transfers are unaffected.
  if (scopedBrandIds && brandId !== undefined) {
    const targetInScope =
      brandId !== null && scopedBrandIds.some((b) => String(b) === String(brandId));
    if (!targetInScope) {
      throw new HttpError(403, "Brand Admin cannot move an employee outside their own brand");
    }
  }

  const patch = {};
  // brandId === null is a deliberate "un-assign from Brand" (move to
  // company-level) rather than "not provided" — only `undefined` means the
  // caller isn't touching brand at all.
  if (brandId !== undefined) {
    if (brandId === null) {
      patch.brandId = null;
    } else {
      await assertBelongsToCompany(db.Brand, brandId, companyId, 'Brand');
      patch.brandId = brandId;
    }
  }
  if (departmentId) {
    await assertBelongsToCompany(db.Department, departmentId, companyId, 'Department');
    patch.departmentId = departmentId;
  }

  await employee.update(patch);

  // Best-effort, logged-not-thrown (same convention as comp-off
  // auto-detection in attendance.service.js) — only relevant when
  // departmentId actually changed, and only matters if this employee has an
  // ESS login already (syncHrTeamRole no-ops otherwise).
  if (patch.departmentId !== undefined) {
    try {
      await syncHrTeamRole({ employeeId: employee.id });
    } catch (err) {
      console.error('HR Team role sync failed:', err);
    }
  }

  return withPhotoUrl(employee);
}

async function deleteEmployee({ companyId, id, scopedBrandIds }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds });
  await employee.destroy();
}

// Hand-picked, fully optional extra capabilities for one specific employee,
// independent of whatever base role (Employee, HR Team, ...) they hold —
// see powerCatalog.js. Implemented as a dedicated per-employee custom Role
// (companyId-scoped, isSystem: false — the same extension point the Role
// model already supports but no other code exercises today) rather than a
// separate permission-override table, so the *entire* rest of the
// permission-resolution stack (getCurrentUser, rbac.middleware.js) needs no
// changes at all — it already unions permissions across every UserRole row
// a user holds.
async function assignEmployeePowers({ companyId, id, powerKeys, scopedBrandIds }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds });

  const keys = Array.isArray(powerKeys) ? powerKeys : [];
  const unknownKeys = keys.filter((key) => !POWER_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new HttpError(400, `Unknown power key(s): ${unknownKeys.join(', ')}`);
  }

  const codes = permissionCodesForKeys(keys);
  const permissions = codes.length > 0
    ? await db.Permission.findAll({ where: { code: { [Op.in]: codes } } })
    : [];

  await db.sequelize.transaction(async (t) => {
    let role = employee.customRoleId
      ? await db.Role.findByPk(employee.customRoleId, { transaction: t })
      : null;

    if (!role) {
      const roleName = `Custom Powers – ${employee.id}`;
      try {
        role = await db.Role.create(
          { companyId, name: roleName, isSystem: false, description: 'Per-employee custom powers' },
          { transaction: t }
        );
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          // Race: another concurrent assignment for the same employee beat
          // this one to the find-or-create (same pattern as
          // leaveBalance.service.js::getOrCreateBalance).
          role = await db.Role.findOne({ where: { companyId, name: roleName }, transaction: t });
        } else {
          throw err;
        }
      }
      await employee.update({ customRoleId: role.id }, { transaction: t });
    }

    // Hard delete — role_permissions is paranoid but (unlike every other
    // model in this app) never actually soft-deleted anywhere else in the
    // codebase. A normal .destroy() would leave a dead row occupying the
    // (role_id, permission_id) composite PK, silently no-op'ing a later
    // re-grant of the same power (bulkCreate + ignoreDuplicates would think
    // the row already exists and skip it, while default queries exclude
    // soft-deleted rows — the permission would look "saved" but grant
    // nothing).
    await db.RolePermission.destroy({ where: { roleId: role.id }, force: true, transaction: t });

    if (permissions.length > 0) {
      await db.RolePermission.bulkCreate(
        permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        { transaction: t }
      );
    }

    // Only relevant the first time an employee (already activated before
    // any power was ever assigned) gets their first power — every later
    // edit reuses the same UserRole row and just changes the Role's
    // permissions in place, which resolves live on the next request with no
    // further grant bookkeeping needed.
    await ensureCustomRoleGrant({ employeeId: employee.id, transaction: t });
  });

  return getEmployeeForRead(employee.id);
}

// Replaces this employee's photo wholesale — any previous photo is
// best-effort deleted from the bucket first so orphaned objects don't
// accumulate, same pattern as companyPolicy.service.js::uploadPolicyAttachment.
// Optional, per the caller's request — an employee with no photo is a
// perfectly valid, expected state, never backfilled or required.
async function uploadEmployeePhoto({ companyId, id, scopedBrandIds, buffer, originalName, mimeType }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds });

  if (employee.photoUrl) {
    try {
      await deleteObject(employee.photoUrl);
    } catch (err) {
      console.error('Could not delete previous employee photo:', err);
    }
  }

  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destination = buildObjectPath({
    companyId,
    resource: 'employee-photos',
    resourceId: employee.id,
    fileName: `${crypto.randomUUID()}-${safeName}`,
  });
  await uploadBuffer({ buffer, destination, contentType: mimeType });

  await employee.update({ photoUrl: destination });
  return withPhotoUrl(employee);
}

async function removeEmployeePhoto({ companyId, id, scopedBrandIds }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds });

  if (employee.photoUrl) {
    try {
      await deleteObject(employee.photoUrl);
    } catch (err) {
      console.error('Could not delete employee photo:', err);
    }
    await employee.update({ photoUrl: null });
  }

  return withPhotoUrl(employee);
}

module.exports = {
  listEmployees,
  getEmployeeForRead,
  getEmployeeForWrite,
  createEmployee,
  updateEmployee,
  transferEmployee,
  deleteEmployee,
  assignEmployeePowers,
  uploadEmployeePhoto,
  removeEmployeePhoto,
};
