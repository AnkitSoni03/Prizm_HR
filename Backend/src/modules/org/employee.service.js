'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { ensureCustomRoleGrant } = require('../../utils/customPowerSync');
const { POWER_KEYS, permissionCodesForKeys } = require('../../config/powerCatalog');
const { buildObjectPath, uploadBuffer, getSignedDownloadUrl, deleteObject } = require('../../utils/gcs');
const { getActiveRosterEntry } = require('../attendance/shiftRoster.service');
const { getActiveEmployeeShift } = require('../attendance/employeeShift.service');
const { dateOnly } = require('../../utils/dateRange');

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
//
// Also resolves today's shift the same way attendance actually does (CLAUDE.md
// rule 7, shiftRoster.service.js::getActiveRosterEntry / employeeShift.
// service.js::getActiveEmployeeShift): defaultShift is the employee's
// standing employee_shifts assignment, todayRoster is a published
// shift_rosters override for today if one exists. Both are surfaced
// separately (not collapsed into one "current shift") so My Profile can show
// *why* today's shift is what it is — e.g. "default: Morning, but today's
// roster puts you on Evening". No new permission needed: this rides the
// existing employee:read / employee:read_own gate on GET /employees/:id.
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
      // Lets EmployeeDetailModal.tsx show which email an employee currently
      // logs in with, and whether that login is active — needed for the
      // "transfer to another email" flow.
      { model: db.User, as: 'loginUser', attributes: ['id', 'email', 'isActive', 'status'] },
    ],
  });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const today = dateOnly(new Date());
  const [roster, defaultAssignment] = await Promise.all([
    getActiveRosterEntry({ employeeId: id, rosterDate: today }),
    getActiveEmployeeShift({ employeeId: id, date: today }),
  ]);

  function shiftSummary(shift) {
    if (!shift) return null;
    return {
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      isNightShift: shift.isNightShift,
      weeklyOffDays: shift.weeklyOffDays,
    };
  }

  const withPhoto = await withPhotoUrl(employee);
  return {
    ...withPhoto,
    defaultShift: shiftSummary(defaultAssignment?.shift ?? null),
    todayRoster: roster
      ? { id: roster.id, rosterDate: roster.rosterDate, shift: shiftSummary(roster.shift) }
      : null,
  };
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
  // status: 'published' — a draft roster is not yet authoritative
  // (getActiveRosterEntry ignores drafts), so counting drafts here would let
  // this gate pass with no schedule that will actually resolve on day one.
  const rosterCount = brandId
    ? await db.ShiftRoster.count({ where: { brandId, status: 'published' } })
    : await db.ShiftRoster.count({ where: { companyId, brandId: null, status: 'published' } });
  if (rosterCount === 0) {
    throw new HttpError(
      422,
      brandId
        ? 'Brand has no published roster; cannot add employees yet'
        : 'Company has no published roster; cannot add employees yet'
    );
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

  return withPhotoUrl(employee);
}

// Permanently, irreversibly deletes an Employee and everything that belongs
// to them — a deliberate, explicitly-requested one-off exception to
// CLAUDE.md's "soft deletes only, never hard-delete" rule (not a pattern to
// copy elsewhere without the same explicit ask).
//
// Most of the cascade is handled by Postgres itself, not this function: the
// employee_id FK on attendance, attendance_regularizations, od_requests,
// leave_requests, leave_balances, comp_off_credits, employee_documents,
// document_upload_requests, employee_face_profiles, employee_shifts,
// employee_salary_structures (and its components), payslips (and its
// components), and payroll_adjustments are all ON DELETE CASCADE — one
// `DELETE FROM employees` removes every one of those rows in a single
// statement (see the migrations for each table). Everything that only
// *references* this employee from the outside is ON DELETE SET NULL and
// equally automatic: direct reports' manager_id, a department's
// head_employee_id, other employees' approver_id on requests they decided,
// this employee's own roster slot (shift_rosters.employee_id — it becomes an
// "unassigned slot" rather than disappearing, same as before any employee is
// assigned to it), and their login's employees.user_id / users.employee_id.
//
// What's left for this function to do by hand:
//   1. GCS objects — Postgres knows nothing about the bucket, so photo,
//      documents, attendance videos, and face-profile photos are collected
//      before the DB delete and removed from the bucket after it commits.
//   2. approval_histories rows for this employee's own requests — requestId
//      is a polymorphic pointer (requestType + requestId), not a real FK, so
//      there's no automatic cascade to clean up after the request rows go.
//   3. The linked ESS login itself is deliberately soft-deleted + deactivated
//      rather than hard-deleted: approval_histories.actor_user_id is
//      NOT NULL/RESTRICT, so hard-deleting a User who ever approved someone
//      else's request would abort the whole transaction. Session/access rows
//      that are exclusively this user's own (UserRole, PasswordReset,
//      Notification) are hard-deleted — nothing else references those.
//      (Refresh tokens are stateless JWTs now, not DB rows — deleting the
//      User row itself is enough; there's nothing left to clean up here.)
async function deleteEmployeePermanently({ companyId, id, scopedBrandIds }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds });

  // paranoid: false — a soft-deleted row is still physically present and
  // will still be swept up by the DB cascade below, so its GCS object (or
  // approval-history trail) must be collected too, not skipped.
  const [documents, attendanceRows, faceProfile, leaveRequests, odRequests, regularizations, compOffCredits] =
    await Promise.all([
      db.EmployeeDocument.findAll({ where: { employeeId: id }, paranoid: false }),
      db.Attendance.findAll({ where: { employeeId: id }, paranoid: false }),
      db.EmployeeFaceProfile.findOne({ where: { employeeId: id }, paranoid: false }),
      db.LeaveRequest.findAll({ where: { employeeId: id }, attributes: ['id'], paranoid: false }),
      db.OdRequest.findAll({ where: { employeeId: id }, attributes: ['id'], paranoid: false }),
      db.AttendanceRegularization.findAll({ where: { employeeId: id }, attributes: ['id'], paranoid: false }),
      db.CompOffCredit.findAll({ where: { employeeId: id }, attributes: ['id'], paranoid: false }),
    ]);

  const gcsPaths = [];
  if (employee.photoUrl) gcsPaths.push(employee.photoUrl);
  for (const doc of documents) if (doc.fileUrl) gcsPaths.push(doc.fileUrl);
  for (const row of attendanceRows) {
    if (row.videoObjectPathCheckin) gcsPaths.push(row.videoObjectPathCheckin);
    if (row.videoObjectPathCheckout) gcsPaths.push(row.videoObjectPathCheckout);
  }
  if (faceProfile) {
    for (const p of [faceProfile.photoObjectPathFront, faceProfile.photoObjectPathLeft, faceProfile.photoObjectPathRight]) {
      if (p) gcsPaths.push(p);
    }
  }

  const { userId, customRoleId } = employee;

  await db.sequelize.transaction(async (t) => {
    await db.ApprovalHistory.destroy({
      where: {
        companyId,
        [Op.or]: [
          { requestType: 'leave_request', requestId: { [Op.in]: leaveRequests.map((r) => r.id) } },
          { requestType: 'od_request', requestId: { [Op.in]: odRequests.map((r) => r.id) } },
          { requestType: 'attendance_regularization', requestId: { [Op.in]: regularizations.map((r) => r.id) } },
          { requestType: 'comp_off_credit', requestId: { [Op.in]: compOffCredits.map((r) => r.id) } },
        ],
      },
      force: true,
      transaction: t,
    });

    if (userId) {
      await db.Notification.destroy({ where: { userId }, force: true, transaction: t });
      await db.UserRole.destroy({ where: { userId }, force: true, transaction: t });
      await db.PasswordReset.destroy({ where: { userId }, force: true, transaction: t });
      const user = await db.User.findByPk(userId, { transaction: t });
      if (user) {
        await user.update({ isActive: false }, { transaction: t });
        await user.destroy({ transaction: t });
      }
    }

    // The per-employee "Custom Powers" role (see assignEmployeePowers) is
    // exclusively this employee's — safe to remove outright rather than
    // leave it behind as dead, unassignable clutter.
    if (customRoleId) {
      await db.Role.destroy({ where: { id: customRoleId }, force: true, transaction: t });
    }

    await employee.destroy({ force: true, transaction: t });
  });

  for (const objectPath of gcsPaths) {
    try {
      await deleteObject(objectPath);
    } catch (err) {
      console.error('Could not delete GCS object during employee permanent delete:', objectPath, err);
    }
  }
}

// Soft on/off toggle for an employee leaving/rejoining — never deletes the
// Employee row (CLAUDE.md: soft deletes only, and this isn't even a delete).
// Cascades to the linked ESS login (if any) in lockstep: deactivating an
// employee should immediately block their check-in/leave/etc. access, and
// reactivating (e.g. a rejoin) should restore it without a fresh invite.
// Gated by the same employee:update permission as the rest of this file's
// mutations — Company Admin/HR Manager/Brand Admin all already hold it.
async function setEmployeeActiveStatus({ companyId, id, scopedBrandIds, isActive }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds });
  await employee.update({ isActive });

  if (employee.userId) {
    const user = await db.User.findByPk(employee.userId);
    if (user) await user.update({ isActive });
  }

  return getEmployeeForRead(employee.id);
}

// Hand-picked, fully optional extra capabilities for one specific employee,
// independent of whatever base role (Employee, ...) they hold —
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
  deleteEmployeePermanently,
  setEmployeeActiveStatus,
  assignEmployeePowers,
  uploadEmployeePhoto,
  removeEmployeePhoto,
};
