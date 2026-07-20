'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

// creator/updater are eager-loaded here (rather than a separate endpoint)
// since holiday:read is shared by both the Company Admin/HR-facing page and
// the ESS "Yearly Holidays" page — the ESS page simply doesn't render these
// fields, per "in employee dashboard nothing show regarding this".
const AUDIT_INCLUDES = [
  {
    model: db.User,
    as: 'creator',
    attributes: ['id', 'email'],
    include: [{ model: db.Employee, as: 'employee', attributes: ['name'] }],
  },
  {
    model: db.User,
    as: 'updater',
    attributes: ['id', 'email'],
    include: [{ model: db.Employee, as: 'employee', attributes: ['name'] }],
  },
];

async function listHolidays({ limit, offset, brandId, from, to }) {
  const { Op } = db.Sequelize;
  const where = {};
  if (brandId) where.brandId = brandId;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }

  // Relies on Holiday's tenant-scope hook for company_id filtering.
  const { rows, count } = await db.Holiday.findAndCountAll({
    where,
    limit,
    offset,
    order: [['date', 'ASC']],
    include: AUDIT_INCLUDES,
  });
  return { rows, count };
}

// scopedBrandIds mirrors rbac.middleware.js's requirePermission output: null
// means a company-wide grant (Company Admin/HR Team), an array means the
// caller only holds brand-scoped grants (Brand Admin) — in which case they
// may only touch a holiday whose own brandId is one of theirs. A company-
// wide holiday (brandId null) is deliberately out of reach for a
// brand-scoped caller, same shape as the employee-invite brandId fix
// elsewhere in this codebase.
async function getHolidayForWrite({ companyId, id, scopedBrandIds }) {
  const holiday = await db.Holiday.findOne({ where: { id, companyId } });
  if (!holiday) throw new HttpError(404, 'Holiday not found');
  if (
    scopedBrandIds &&
    !scopedBrandIds.some((brandId) => String(brandId) === String(holiday.brandId))
  ) {
    throw new HttpError(403, "Holiday is outside caller's brand");
  }
  return holiday;
}

async function createHoliday({ companyId, brandId, date, name, type, createdBy, scopedBrandIds }) {
  // A brand-scoped caller (Brand Admin) with no brandId in the request
  // still only ever means "my own brand" — rbac.middleware.js's
  // requirePermission already rejects a *different* brandId, but an
  // omitted one would otherwise silently fall through to a company-wide
  // holiday (brandId null), which is exactly the shape of bug already
  // fixed once for inviteEmployeeUser.
  const resolvedBrandId = brandId || (scopedBrandIds ? scopedBrandIds[0] : null);

  if (resolvedBrandId) {
    const brand = await db.Brand.findOne({ where: { id: resolvedBrandId, companyId } });
    if (!brand) throw new HttpError(400, 'Brand not found for this company');
  }

  return db.Holiday.create({
    companyId,
    brandId: resolvedBrandId || null,
    date,
    name,
    type: type || 'public',
    createdBy: createdBy || null,
  });
}

async function updateHoliday({ companyId, id, updates, updatedBy, scopedBrandIds }) {
  const holiday = await getHolidayForWrite({ companyId, id, scopedBrandIds });
  const { date, name, type } = updates;

  await holiday.update({
    ...(date !== undefined && { date }),
    ...(name !== undefined && { name }),
    ...(type !== undefined && { type }),
    updatedBy: updatedBy || null,
  });
  return holiday;
}

async function deleteHoliday({ companyId, id, scopedBrandIds }) {
  const holiday = await getHolidayForWrite({ companyId, id, scopedBrandIds });
  await holiday.destroy();
}

module.exports = { listHolidays, getHolidayForWrite, createHoliday, updateHoliday, deleteHoliday };
