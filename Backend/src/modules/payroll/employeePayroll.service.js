'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const { employeeSearchWhere } = require('../../utils/employeeSearch');
const { employeeScopeWhere } = require('./payrollAccess');
const { generateMonthForAll, recalculatePayroll, processPendingRecalcs, isMonthComplete } = require('./payrollEngine');

const asGroup = (fn) => runAsCompany(null, fn);

const EMPLOYEE_INCLUDE = (where) => ({
  model: db.Employee,
  as: 'employee',
  attributes: ['id', 'name', 'employeeCode', 'companyId', 'brandId', 'workState', 'dateOfJoining'],
  where,
  required: true,
  include: [
    { model: db.Company, as: 'company', attributes: ['id', 'name', 'legalName'] },
    { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
    { model: db.Designation, as: 'designation', attributes: ['id', 'title'] },
    { model: db.Department, as: 'department', attributes: ['id', 'name'] },
  ],
});

async function listPayrolls(access, { year, month, companyId, brandId, search, limit = 100, offset = 0 }) {
  if (!access.groupId) return { rows: [], count: 0 };
  return asGroup(async () => {
    const employeeWhere = employeeScopeWhere(access, { companyId, brandId });
    if (search) Object.assign(employeeWhere, employeeSearchWhere(search));
    const where = { groupId: access.groupId };
    if (year) where.periodYear = Number(year);
    if (month) where.periodMonth = Number(month);
    const result = await db.EmployeePayroll.findAndCountAll({
      where,
      attributes: { exclude: ['rulesSnapshot'] },
      include: [EMPLOYEE_INCLUDE(employeeWhere)],
      order: [['periodYear', 'DESC'], ['periodMonth', 'DESC'], [{ model: db.Employee, as: 'employee' }, 'name', 'ASC']],
      limit,
      offset,
      distinct: true,
    });
    const totals = await db.EmployeePayroll.findOne({
      where,
      include: [{ ...EMPLOYEE_INCLUDE(employeeWhere), attributes: [], include: [] }],
      attributes: [
        [db.sequelize.fn('SUM', db.sequelize.col('EmployeePayroll.gross_earned')), 'gross'],
        [db.sequelize.fn('SUM', db.sequelize.col('EmployeePayroll.total_deductions')), 'deductions'],
        [db.sequelize.fn('SUM', db.sequelize.col('EmployeePayroll.total_employer')), 'employer'],
        [db.sequelize.fn('SUM', db.sequelize.col('EmployeePayroll.bonus_total')), 'bonus'],
        [db.sequelize.fn('SUM', db.sequelize.col('EmployeePayroll.net_pay')), 'net'],
      ],
      raw: true,
    });
    return {
      ...result,
      totals: {
        gross: Number(totals?.gross) || 0,
        deductions: Number(totals?.deductions) || 0,
        employer: Number(totals?.employer) || 0,
        bonus: Number(totals?.bonus) || 0,
        net: Number(totals?.net) || 0,
      },
    };
  });
}

async function getPayroll(access, id) {
  const row = await asGroup(() =>
    db.EmployeePayroll.findOne({
      where: { id, groupId: access.groupId },
      attributes: { exclude: ['rulesSnapshot'] },
      include: [EMPLOYEE_INCLUDE(employeeScopeWhere(access))],
    })
  );
  if (!row) throw new HttpError(404, 'Payroll not found');
  return row;
}

async function recalculateOne(access, id) {
  await getPayroll(access, id);
  await recalculatePayroll(id);
  return getPayroll(access, id);
}

// Manual "generate now" for one completed month (the cron does this on the
// 1st by itself) — creates whatever is missing, then refreshes anything
// waiting for a recalculation.
async function generateMonth(access, { year, month }) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new HttpError(400, 'Choose a month');
  if (!isMonthComplete(y, m)) throw new HttpError(400, 'Payroll for a month can only be generated after the month is over');
  const result = await generateMonthForAll({
    year: y,
    month: m,
    groupId: access.groupId,
    employeeWhere: access.level === 'group' ? null : employeeScopeWhere(access),
  });
  await processPendingRecalcs();
  return result;
}

// ---- Employee's own view ----------------------------------------------------

// An employee sees a month only after a payroll manager has reviewed it and
// shared it (payslip_released) — then the full slip: structure, deductions,
// employer contributions and the PDF. Unshared months don't exist for them.
function toEmployeeView(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  delete plain.rulesSnapshot;
  return plain;
}

async function listMyPayrolls(employeeId) {
  const rows = await asGroup(() =>
    db.EmployeePayroll.findAll({
      where: { employeeId, payslipReleased: true },
      order: [['periodYear', 'DESC'], ['periodMonth', 'DESC']],
      include: [EMPLOYEE_INCLUDE({})],
    })
  );
  return rows.map(toEmployeeView);
}

async function getMyPayroll(employeeId, id) {
  const row = await asGroup(() =>
    db.EmployeePayroll.findOne({ where: { id, employeeId, payslipReleased: true }, include: [EMPLOYEE_INCLUDE({})] })
  );
  if (!row) throw new HttpError(404, 'Payroll not found');
  return row;
}

// ---- Sharing with employees (managers) --------------------------------------

// Shares (or un-shares) generated months with the employees. Either `ids`
// (chosen payroll rows) or a whole month (`year` + `month`, narrowed by the
// same company/brand filter as the list). Returns the rows that changed,
// with the employee's login, so the caller can notify on share.
async function sharePayrolls(access, { ids, year, month, companyId, brandId, share = true }) {
  const where = { groupId: access.groupId, payslipReleased: !share };
  if (Array.isArray(ids) && ids.length > 0) {
    if (ids.length > 5000) throw new HttpError(400, 'Choose at most 5000 rows');
    where.id = { [Op.in]: ids.map(String) };
  } else {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new HttpError(400, 'Choose a month or employees');
    where.periodYear = y;
    where.periodMonth = m;
  }
  return asGroup(async () => {
    const rows = await db.EmployeePayroll.findAll({
      where,
      attributes: ['id', 'periodYear', 'periodMonth', 'netPay', 'employeeId'],
      include: [
        {
          model: db.Employee,
          as: 'employee',
          attributes: ['id', 'companyId', 'userId'],
          where: employeeScopeWhere(access, { companyId, brandId }),
          required: true,
        },
      ],
    });
    if (rows.length > 0) {
      await db.EmployeePayroll.update(
        { payslipReleased: share, releasedAt: share ? new Date() : null },
        { where: { id: { [Op.in]: rows.map((r) => r.id) } } }
      );
    }
    return rows;
  });
}

module.exports = {
  listPayrolls,
  getPayroll,
  recalculateOne,
  generateMonth,
  toEmployeeView,
  listMyPayrolls,
  getMyPayroll,
  sharePayrolls,
};
