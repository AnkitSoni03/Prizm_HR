'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const { employeeSearchWhere } = require('../../utils/employeeSearch');
const { employeeScopeWhere, scopedEmployeeWhere } = require('./payrollAccess');
const { BONUS_TYPES, normalizeRules, resolveCustomItems, computeSalary } = require('./payrollRules');
const { memberItemIds } = require('./customItemMembers');
const { monthBounds, queuePayrollRecalc, recalculatePayroll } = require('./payrollEngine');

const MAX_BULK = 2000;

// One-time extra pay (bonus, incentive, overtime, reimbursement…) for one
// employee in one month. Managers add/edit/delete within their scope (Group /
// own company / own brand); viewers read within theirs. A month that's already generated is recalculated on every change —
// the difference reaches the next salary as arrears/recovery.

const asGroup = (fn) => runAsCompany(null, fn);
const TYPE_KEYS = BONUS_TYPES.map((t) => t.key);

const EMPLOYEE_INCLUDE = (where) => ({
  model: db.Employee,
  as: 'employee',
  attributes: ['id', 'name', 'employeeCode', 'companyId', 'brandId'],
  where,
  required: true,
  include: [
    { model: db.Company, as: 'company', attributes: ['id', 'name'] },
    { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
  ],
});

async function listBonuses(access, { year, month, type, companyId, brandId, search, limit = 50, offset = 0 }) {
  if (!access.groupId) return { rows: [], count: 0, total: 0 };
  return asGroup(async () => {
    const employeeWhere = employeeScopeWhere(access, { companyId, brandId });
    if (search) Object.assign(employeeWhere, employeeSearchWhere(search));
    const where = { groupId: access.groupId };
    if (year) where.periodYear = Number(year);
    if (month) where.periodMonth = Number(month);
    if (type && TYPE_KEYS.includes(type)) where.type = type;
    const result = await db.PayrollBonus.findAndCountAll({
      where,
      include: [EMPLOYEE_INCLUDE(employeeWhere), { model: db.User, as: 'createdByUser', attributes: ['id', 'email'] }],
      order: [['periodYear', 'DESC'], ['periodMonth', 'DESC'], ['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
    const sum = await db.PayrollBonus.findOne({
      where,
      include: [{ ...EMPLOYEE_INCLUDE(employeeWhere), attributes: [], include: [] }],
      attributes: [[db.sequelize.fn('SUM', db.sequelize.col('PayrollBonus.amount')), 'total']],
      raw: true,
    });
    return { ...result, total: Number(sum && sum.total) || 0 };
  });
}

function cleanInput(body, current = null) {
  const merged = { ...(current || {}), ...body };
  const year = Number(merged.year ?? merged.periodYear);
  const month = Number(merged.month ?? merged.periodMonth);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpError(400, 'Choose the month this is paid in');
  }
  if (!TYPE_KEYS.includes(merged.type)) throw new HttpError(400, `Type must be one of: ${TYPE_KEYS.join(', ')}`);
  const calcType = merged.calcType === 'percent' ? 'percent' : 'fixed';
  let amount = null;
  let percent = null;
  let basis = null;
  if (calcType === 'percent') {
    percent = Math.round(Number(merged.percent) * 100) / 100;
    if (!Number.isFinite(percent) || percent <= 0 || percent > 1000) throw new HttpError(400, 'Enter a percentage between 0 and 1000');
    if (!['basic', 'gross', 'ctc'].includes(merged.basis)) throw new HttpError(400, "The percentage must be of 'basic', 'gross' or 'ctc'");
    basis = merged.basis;
  } else {
    amount = Math.round(Number(merged.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter an amount above zero');
    if (amount > 100000000) throw new HttpError(400, 'That amount is too large');
  }
  const title = typeof merged.title === 'string' ? merged.title.trim().slice(0, 120) : '';
  // Not sent → the type's default (a reimbursement isn't income).
  const typeDefault = BONUS_TYPES.find((t) => t.key === merged.type).taxable;
  const taxable = body.taxable !== undefined ? body.taxable !== false : current && body.type === undefined ? current.taxable : typeDefault;
  return {
    periodYear: year,
    periodMonth: month,
    type: merged.type,
    title: title || null,
    calcType,
    percent,
    basis,
    amount,
    taxable,
    note: merged.note ? String(merged.note).slice(0, 1000) : null,
  };
}

// A bonus is paid through the month's payroll, so the employee needs a
// salary in that month.
async function assertSalaryInMonth(employeeId, year, month) {
  const { start, end } = monthBounds(year, month);
  const salary = await db.SalaryAssignment.findOne({
    where: {
      employeeId,
      effectiveFrom: { [Op.lte]: end },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: start } }],
    },
    attributes: ['id'],
  });
  if (!salary) throw new HttpError(400, 'This employee has no salary in that month — assign a salary first');
}

// A % bonus's amount for each employee, from their salary in that month
// (the latest one when the salary changed mid-month): the full monthly
// Basic / Gross / CTC, never cut for LOP. The month's payroll keeps it in
// step later (payrollEngine.js syncBonusAmounts).
async function resolvePercentAmounts({ groupId, employeeIds, year, month, percent, basis }) {
  const { start, end } = monthBounds(year, month);
  const assignments = await db.SalaryAssignment.findAll({
    where: {
      employeeId: { [Op.in]: employeeIds },
      effectiveFrom: { [Op.lte]: end },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: start } }],
    },
    include: [{ model: db.PayrollTemplate, as: 'template', paranoid: false }],
    order: [['effectiveFrom', 'ASC']],
  });
  const latest = new Map();
  for (const a of assignments) latest.set(String(a.employeeId), a);
  const items = (await db.PayrollCustomItem.findAll({ where: { groupId, isActive: true } }))
    .map((i) => i.get({ plain: true }))
    .filter((i) => !(Array.isArray(i.months) && i.months.length > 0));
  const members = await memberItemIds([...latest.keys()]);
  const out = new Map();
  for (const [employeeId, a] of latest) {
    const rules = normalizeRules(a.template ? a.template.rules : {});
    const salary = computeSalary({
      monthlyCtc: Number(a.monthlyCtc),
      rules,
      customItems: resolveCustomItems(rules, items.filter((i) => (members.get(employeeId) || new Set()).has(String(i.id)))),
      deductionsEnabled: a.deductionsEnabled,
      disabledItems: a.disabledItems || [],
    });
    const base = basis === 'ctc' ? salary.monthlyCtc : basis === 'basic' ? salary.earnings.find((e) => e.key === 'basic').full : salary.full.grossSalary;
    out.set(employeeId, Math.round(base * percent) / 100);
  }
  return out;
}

function recalcMonth(employeeId, year, month) {
  const { start } = monthBounds(year, month);
  queuePayrollRecalc({ employeeId, fromDate: start, toDate: start });
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortLabel = (p) => `${MONTH_SHORT[p.month - 1]} ${p.year}`;

// The months a new bonus is paid in: body.periods = [{ year, month }] (one
// bonus per month — nothing in the other months), or a single year/month.
function cleanPeriods(body) {
  const raw = Array.isArray(body.periods) && body.periods.length > 0 ? body.periods : [{ year: body.year, month: body.month }];
  const seen = new Set();
  const out = [];
  for (const p of raw) {
    const year = Number(p && p.year);
    const month = Number(p && p.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new HttpError(400, 'Choose the month(s) this is paid in');
    }
    const key = `${year}-${month}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ year, month });
    }
  }
  if (out.length > 24) throw new HttpError(400, 'Choose at most 24 months at a time');
  return out.sort((x, y) => x.year * 12 + x.month - (y.year * 12 + y.month));
}

// Adds the same bonus to one or many employees (`employeeIds`, or a single
// `employeeId`) in one or several months (`periods`) — one bonus row per
// employee per month. Anyone outside the caller's scope, or without a salary in one
// of the months, is skipped for that month and reported back, so a bulk add
// still works when a few people aren't on payroll.
async function createBonuses(access, { body, userId }) {
  const raw = Array.isArray(body.employeeIds) ? body.employeeIds : [body.employeeId];
  const ids = [...new Set(raw.filter((id) => id !== undefined && id !== null && id !== '').map(String))];
  if (ids.length === 0) throw new HttpError(400, 'Choose at least one employee');
  if (ids.length > MAX_BULK) throw new HttpError(400, `Choose at most ${MAX_BULK} employees at a time`);
  const periods = cleanPeriods(body);
  const input = cleanInput({ ...body, year: periods[0].year, month: periods[0].month });
  delete input.periodYear;
  delete input.periodMonth;

  const { created, skipped } = await asGroup(async () => {
    const employees = await db.Employee.findAll({
      where: { ...(await scopedEmployeeWhere(access)), id: { [Op.in]: ids } },
      attributes: ['id', 'name', 'employeeCode', 'companyId'],
    });
    const found = new Map(employees.map((e) => [String(e.id), e]));

    const skippedRows = [];
    for (const id of ids) {
      if (!found.has(id)) skippedRows.push({ employeeId: id, name: null, reason: 'Not in your payroll scope' });
    }
    const toCreate = [];
    for (const period of periods) {
      const { start, end } = monthBounds(period.year, period.month);
      // eslint-disable-next-line no-await-in-loop
      const salaries = await db.SalaryAssignment.findAll({
        where: {
          employeeId: { [Op.in]: employees.map((e) => e.id) },
          effectiveFrom: { [Op.lte]: end },
          [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: start } }],
        },
        attributes: ['employeeId'],
      });
      const paid = new Set(salaries.map((a) => String(a.employeeId)));
      const amounts =
        input.calcType === 'percent'
          ? // eslint-disable-next-line no-await-in-loop
          await resolvePercentAmounts({
            groupId: access.groupId,
            employeeIds: [...paid],
            year: period.year,
            month: period.month,
            percent: input.percent,
            basis: input.basis,
          })
          : null;
      for (const employee of employees) {
        const id = String(employee.id);
        const skip = (reason) =>
          skippedRows.push({ employeeId: id, name: employee.name, employeeCode: employee.employeeCode, reason: `${reason} (${shortLabel(period)})` });
        if (!paid.has(id)) skip('No salary that month');
        else if (amounts && !(amounts.get(id) > 0)) skip('Works out to ₹0');
        else {
          toCreate.push({
            ...input,
            periodYear: period.year,
            periodMonth: period.month,
            amount: amounts ? amounts.get(id) : input.amount,
            companyId: employee.companyId,
            groupId: access.groupId,
            employeeId: employee.id,
            createdByUserId: userId,
            updatedByUserId: userId,
          });
        }
      }
    }
    if (toCreate.length === 0) {
      throw new HttpError(
        400,
        ids.length === 1 && periods.length === 1
          ? found.size === 0
            ? 'Employee not found in your payroll scope'
            : 'This employee has no salary in that month — assign a salary first'
          : 'None of the selected employees has a salary in the chosen month(s)'
      );
    }
    const rows = await db.sequelize.transaction((t) => db.PayrollBonus.bulkCreate(toCreate, { transaction: t }));
    return { created: rows, skipped: skippedRows };
  });

  // Months already generated are recalculated one after another (a bulk add
  // can touch hundreds of employees — never all at once).
  setImmediate(async () => {
    try {
      const months = await asGroup(() =>
        db.EmployeePayroll.findAll({
          where: {
            [Op.or]: created.map((b) => ({ employeeId: b.employeeId, periodYear: b.periodYear, periodMonth: b.periodMonth })),
          },
          attributes: ['id'],
        })
      );
      for (const row of months) {
        // eslint-disable-next-line no-await-in-loop
        await recalculatePayroll(row.id);
      }
    } catch (err) {
      console.error('Payroll recalculation after bonus failed:', err);
    }
  });
  return { created, skipped };
}

async function getBonus(access, id) {
  const bonus = await asGroup(() =>
    db.PayrollBonus.findOne({
      where: { id, groupId: access.groupId },
      include: [{ model: db.Employee, as: 'employee', attributes: ['id'], where: employeeScopeWhere(access), required: true }],
    })
  );
  if (!bonus) throw new HttpError(404, 'Not found');
  return bonus;
}

async function updateBonus(access, { id, body, userId }) {
  const bonus = await getBonus(access, id);
  const before = { year: bonus.periodYear, month: bonus.periodMonth };
  const input = cleanInput(body, bonus.get({ plain: true }));
  await asGroup(async () => {
    if (input.periodYear !== before.year || input.periodMonth !== before.month) {
      await assertSalaryInMonth(bonus.employeeId, input.periodYear, input.periodMonth);
    }
    if (input.calcType === 'percent') {
      const amounts = await resolvePercentAmounts({
        groupId: access.groupId,
        employeeIds: [String(bonus.employeeId)],
        year: input.periodYear,
        month: input.periodMonth,
        percent: input.percent,
        basis: input.basis,
      });
      input.amount = amounts.get(String(bonus.employeeId)) || 0;
      if (!(input.amount > 0)) throw new HttpError(400, 'This works out to ₹0 for this employee');
    }
    await bonus.update({ ...input, updatedByUserId: userId });
  });
  recalcMonth(bonus.employeeId, before.year, before.month);
  if (input.periodYear !== before.year || input.periodMonth !== before.month) {
    recalcMonth(bonus.employeeId, input.periodYear, input.periodMonth);
  }
  return bonus;
}

async function deleteBonus(access, { id }) {
  const bonus = await getBonus(access, id);
  await asGroup(() => bonus.destroy());
  recalcMonth(bonus.employeeId, bonus.periodYear, bonus.periodMonth);
}

module.exports = { listBonuses, createBonuses, updateBonus, deleteBonus };
