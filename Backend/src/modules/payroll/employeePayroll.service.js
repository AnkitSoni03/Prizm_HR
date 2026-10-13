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
  const result = await generateMonthForAll({ year: y, month: m, groupId: access.groupId });
  await processPendingRecalcs();
  return result;
}

// ---- Employee's own view ----------------------------------------------------

// Before the payslip is released (payslip request approved) an employee sees
// only what reaches them: deductions and in-hand. The full structure
// (earnings split, employer contributions, PF passbook) comes with the slip.
function toEmployeeView(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  delete plain.rulesSnapshot;
  if (plain.payslipReleased) return plain;
  const d = plain.details || {};
  return {
    id: plain.id,
    periodYear: plain.periodYear,
    periodMonth: plain.periodMonth,
    monthDays: plain.monthDays,
    paidDays: plain.paidDays,
    lopDays: plain.lopDays,
    totalDeductions: plain.totalDeductions,
    carryAdjustment: plain.carryAdjustment,
    netPay: plain.netPay,
    revision: plain.revision,
    revisedAt: plain.revisedAt,
    generatedAt: plain.generatedAt,
    payslipReleased: false,
    details: {
      deductions: (d.deductions || []).map(({ key, name, amount }) => ({ key, name, amount })),
      carries: d.carries || [],
      lopDates: d.lopDates || [],
      days: d.days || null,
    },
  };
}

async function listMyPayrolls(employeeId) {
  const rows = await asGroup(() =>
    db.EmployeePayroll.findAll({
      where: { employeeId },
      order: [['periodYear', 'DESC'], ['periodMonth', 'DESC']],
      include: [EMPLOYEE_INCLUDE({})],
    })
  );
  return rows.map(toEmployeeView);
}

async function getMyPayroll(employeeId, id) {
  const row = await asGroup(() =>
    db.EmployeePayroll.findOne({ where: { id, employeeId }, include: [EMPLOYEE_INCLUDE({})] })
  );
  if (!row) throw new HttpError(404, 'Payroll not found');
  return row;
}

// ---- Payslip requests -------------------------------------------------------

async function listPayslipRequests(access, { status, companyId, brandId, search, limit = 50, offset = 0 }) {
  if (!access.groupId) return { rows: [], count: 0 };
  return asGroup(() => {
    const employeeWhere = employeeScopeWhere(access, { companyId, brandId });
    if (search) Object.assign(employeeWhere, employeeSearchWhere(search));
    const where = { groupId: access.groupId };
    if (status && status !== 'all') where.status = status;
    return db.PayslipRequest.findAndCountAll({
      where,
      include: [EMPLOYEE_INCLUDE(employeeWhere), { model: db.User, as: 'decidedByUser', attributes: ['id', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
  });
}

function periodKey(p) {
  return `${p.year}-${p.month}`;
}

async function createPayslipRequest({ employeeId, periods, note }) {
  if (!Array.isArray(periods) || periods.length === 0) throw new HttpError(400, 'Choose at least one month');
  if (periods.length > 24) throw new HttpError(400, 'Choose at most 24 months');
  const clean = [];
  const seen = new Set();
  for (const p of periods) {
    const year = Number(p && p.year);
    const month = Number(p && p.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new HttpError(400, 'Invalid month');
    const key = periodKey({ year, month });
    if (!seen.has(key)) {
      seen.add(key);
      clean.push({ year, month });
    }
  }

  return asGroup(async () => {
    const employee = await db.Employee.findByPk(employeeId, { attributes: ['id', 'name', 'employeeCode', 'companyId'] });
    if (!employee) throw new HttpError(404, 'Employee not found');
    const rows = await db.EmployeePayroll.findAll({
      where: { employeeId, [Op.or]: clean.map((p) => ({ periodYear: p.year, periodMonth: p.month })) },
      attributes: ['id', 'periodYear', 'periodMonth', 'payslipReleased', 'groupId'],
    });
    const byKey = new Map(rows.map((r) => [periodKey({ year: r.periodYear, month: r.periodMonth }), r]));
    const missing = clean.filter((p) => !byKey.has(periodKey(p)));
    if (missing.length > 0) {
      throw new HttpError(400, `No payroll yet for ${missing.map((p) => `${p.month}/${p.year}`).join(', ')} — a month's payroll appears after the month ends`);
    }
    const wanted = clean.filter((p) => !byKey.get(periodKey(p)).payslipReleased);
    if (wanted.length === 0) throw new HttpError(400, 'Those payslips are already available to you');

    const pending = await db.PayslipRequest.findAll({ where: { employeeId, status: 'pending' }, attributes: ['periods'] });
    const pendingKeys = new Set(pending.flatMap((r) => (r.periods || []).map(periodKey)));
    const duplicate = wanted.find((p) => pendingKeys.has(periodKey(p)));
    if (duplicate) throw new HttpError(409, `You already have a pending request for ${duplicate.month}/${duplicate.year}`);

    const request = await db.PayslipRequest.create({
      companyId: employee.companyId,
      groupId: rows[0].groupId,
      employeeId,
      periods: wanted,
      note: note ? String(note).slice(0, 1000) : null,
      status: 'pending',
    });
    return { request, employee };
  });
}

async function listMyPayslipRequests(employeeId) {
  return asGroup(() =>
    db.PayslipRequest.findAll({ where: { employeeId }, order: [['createdAt', 'DESC']], limit: 50 })
  );
}

async function cancelMyPayslipRequest(employeeId, id) {
  return asGroup(async () => {
    const request = await db.PayslipRequest.findOne({ where: { id, employeeId } });
    if (!request) throw new HttpError(404, 'Request not found');
    if (request.status !== 'pending') throw new HttpError(409, 'Only a pending request can be cancelled');
    await request.update({ status: 'cancelled' });
    return request;
  });
}

async function decidePayslipRequest(access, { id, decision, reason, userId }) {
  if (!['approved', 'rejected'].includes(decision)) throw new HttpError(400, "decision must be 'approved' or 'rejected'");
  if (decision === 'rejected' && !(reason && String(reason).trim())) throw new HttpError(400, 'A reason is required to reject');
  return asGroup(async () => {
    const request = await db.PayslipRequest.findOne({
      where: { id, groupId: access.groupId },
      include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'name', 'employeeCode', 'companyId', 'userId'] }],
    });
    if (!request) throw new HttpError(404, 'Request not found');
    if (request.status !== 'pending') throw new HttpError(409, 'This request was already decided');

    await db.sequelize.transaction(async (t) => {
      await request.update(
        {
          status: decision,
          decidedByUserId: userId,
          decidedAt: new Date(),
          rejectionReason: decision === 'rejected' ? String(reason).trim() : null,
        },
        { transaction: t }
      );
      if (decision === 'approved') {
        await db.EmployeePayroll.update(
          { payslipReleased: true, releasedAt: new Date() },
          {
            where: {
              employeeId: request.employeeId,
              [Op.or]: request.periods.map((p) => ({ periodYear: p.year, periodMonth: p.month })),
            },
            transaction: t,
          }
        );
      }
    });
    return request;
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
  listPayslipRequests,
  createPayslipRequest,
  listMyPayslipRequests,
  cancelMyPayslipRequest,
  decidePayslipRequest,
};
