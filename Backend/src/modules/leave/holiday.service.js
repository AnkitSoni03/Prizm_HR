'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { datesBetween } = require('../../utils/dateRange');

// Sanity cap on a single "from/to" holiday creation — a real multi-day
// holiday (Diwali, a year-end shutdown, ...) never runs longer than this;
// it exists to catch a fat-fingered year swap in the "to" date, not to
// model any real business rule.
const MAX_RANGE_DAYS = 31;

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
  // Range-overlap, not a plain date match — a holiday now spans
  // date..endDate, so a holiday that starts before `from` but ends inside
  // the window (or vice versa) still needs to show up.
  if (from) where.endDate = { [Op.gte]: from };
  if (to) where.date = { [Op.lte]: to };

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
// means a company-wide grant (Company Admin, or an employee granted the
// equivalent company-wide Power), an array means the
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

// One row = one holiday *event*, however many days long — date..endDate,
// inclusive. `toDate` is optional and defaults to `date` itself (a plain
// one-day holiday). Every consumer that needs to know "is this calendar day
// a holiday" (workingDays.js::isHoliday, leave/comp-off day-counting,
// holidayReminder.job.js) checks range containment instead of an exact
// match, so a multi-day row is transparently a holiday on every day inside
// it.
async function createHoliday({ companyId, brandId, date, toDate, name, type, createdBy, scopedBrandIds }) {
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

  const endDate = validateRange(date, toDate || date);

  return db.Holiday.create({
    companyId,
    brandId: resolvedBrandId || null,
    date,
    endDate,
    name,
    type: type || 'public',
    createdBy: createdBy || null,
  });
}

// Shared by create and update — throws 400 on an inverted or over-long
// range, otherwise returns the validated end date.
function validateRange(date, endDate) {
  if (endDate < date) {
    throw new HttpError(400, 'toDate must be on or after date');
  }
  if (datesBetween(date, endDate).length > MAX_RANGE_DAYS) {
    throw new HttpError(400, `Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return endDate;
}

async function updateHoliday({ companyId, id, updates, updatedBy, scopedBrandIds }) {
  const holiday = await getHolidayForWrite({ companyId, id, scopedBrandIds });
  const { date, toDate, name, type } = updates;

  const nextDate = date !== undefined ? date : holiday.date;
  const nextEndDate = toDate !== undefined ? toDate : holiday.endDate;

  await holiday.update({
    date: nextDate,
    endDate: validateRange(nextDate, nextEndDate),
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
