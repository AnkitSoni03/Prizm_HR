'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function assertBelongsToCompany(model, id, companyId, label) {
  const row = await model.findOne({ where: { id, companyId } });
  if (!row) throw new HttpError(400, `${label} not found for this company`);
}

// shift_rosters now carries company_id directly (added for brand-optional
// operation — a company-level roster has no brand row to derive it from),
// so tenant scoping filters on it straight rather than joining through Brand.
async function listShiftRosters({ companyId, brandId, employeeId, rosterDate, limit, offset }) {
  const where = {};
  if (companyId) where.companyId = companyId;
  if (Array.isArray(brandId)) {
    if (brandId.length > 0) where.brandId = { [Op.in]: brandId };
  } else if (brandId) {
    where.brandId = brandId;
  }
  if (employeeId) where.employeeId = employeeId;
  if (rosterDate) where.rosterDate = rosterDate;

  const { rows, count } = await db.ShiftRoster.findAndCountAll({
    where,
    limit,
    offset,
    order: [['rosterDate', 'DESC']],
    include: [
      { model: db.Brand, as: 'brand', attributes: ['id', 'name'], required: false },
      { model: db.Shift, as: 'shift' },
      { model: db.Employee, as: 'employee', attributes: ['id', 'employeeCode'], required: false },
    ],
  });
  return { rows, count };
}

async function getShiftRosterForWrite({ companyId, id }) {
  const where = { id };
  if (companyId) where.companyId = companyId;

  const roster = await db.ShiftRoster.findOne({ where });
  if (!roster) throw new HttpError(404, 'Roster entry not found');
  return roster;
}

// Used by the check-in flow: shift_rosters overrides employee_shifts for a
// specific date (CLAUDE.md rule 7). Only a published entry counts — a draft
// roster is not yet authoritative.
async function getActiveRosterEntry({ employeeId, rosterDate }) {
  return db.ShiftRoster.findOne({
    where: { employeeId, rosterDate, status: 'published' },
    include: [{ model: db.Shift, as: 'shift' }],
  });
}

// employeeId is optional: an "unassigned" roster slot (brand/company + shift
// + date, no employee yet) is what lets a Brand (or, for a brand-optional
// company, the Company itself) satisfy the "needs >=1 roster before its
// first employee" tenancy rule before anyone exists to assign it to.
// brandId is optional: a company-level roster (companies.uses_brands =
// false) has no Brand at all.
async function createShiftRoster({ companyId, employeeId, shiftId, brandId, rosterDate }) {
  await assertBelongsToCompany(db.Shift, shiftId, companyId, 'Shift');
  if (brandId) await assertBelongsToCompany(db.Brand, brandId, companyId, 'Brand');

  if (employeeId) {
    const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new HttpError(400, 'Employee not found for this company');
    if (String(employee.brandId || '') !== String(brandId || '')) {
      throw new HttpError(400, "brandId does not match the employee's current brand");
    }
  }

  try {
    return await db.ShiftRoster.create({
      employeeId: employeeId || null,
      shiftId,
      companyId,
      brandId: brandId || null,
      rosterDate,
      status: 'draft',
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'A roster entry already exists for this employee on this date');
    }
    throw err;
  }
}

async function updateShiftRoster({ companyId, id, updates, publisherEmployeeId, scopedBrandIds }) {
  const roster = await getShiftRosterForWrite({ companyId, id });
  // scopedBrandIds is null for a company-wide grant; for a brand-scoped
  // caller (Brand Admin) it must actually contain this roster's brand —
  // the request body has no reliable brandId to check against (it's not
  // required on a PATCH), so the target row itself is the source of truth.
  if (scopedBrandIds && !scopedBrandIds.some((brandId) => String(brandId) === String(roster.brandId))) {
    throw new HttpError(404, 'Roster entry not found');
  }
  const { shiftId, status, employeeId } = updates;

  if (shiftId !== undefined) {
    await assertBelongsToCompany(db.Shift, shiftId, companyId, 'Shift');
  }
  if (employeeId !== undefined && employeeId !== null) {
    const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new HttpError(400, 'Employee not found for this company');
    if (String(employee.brandId || '') !== String(roster.brandId || '')) {
      throw new HttpError(400, "employeeId does not match this roster entry's brand");
    }
  }

  const patch = {};
  if (shiftId !== undefined) patch.shiftId = shiftId;
  if (employeeId !== undefined) patch.employeeId = employeeId;
  if (status !== undefined) {
    if (status === 'published' && !(employeeId !== undefined ? employeeId : roster.employeeId)) {
      throw new HttpError(422, 'Cannot publish a roster entry with no employee assigned');
    }
    patch.status = status;
    if (status === 'published') patch.publishedBy = publisherEmployeeId || null;
  }

  await roster.update(patch);
  return roster;
}

module.exports = {
  listShiftRosters,
  getActiveRosterEntry,
  createShiftRoster,
  updateShiftRoster,
};
