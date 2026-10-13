'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const { addDays, dateOnly } = require('../../utils/dateRange');
const { employeeSearchWhere } = require('../../utils/employeeSearch');
const { BUILT_IN_ITEMS, customItemKey } = require('./payrollRules');
const { employeeScopeWhere } = require('./payrollAccess');
const { catchUpEmployee, queuePayrollRecalc, previousMonth, monthBounds } = require('./payrollEngine');

// Every query here runs with the tenant hook off — managers work across all
// companies of their Group, and viewers are bounded by employeeScopeWhere.
const asGroup = (fn) => runAsCompany(null, fn);

const EMPLOYEE_ATTRS = ['id', 'name', 'employeeCode', 'companyId', 'brandId', 'workState', 'status', 'dateOfJoining'];
const EMPLOYEE_INCLUDE = (where) => ({
  model: db.Employee,
  as: 'employee',
  attributes: EMPLOYEE_ATTRS,
  where,
  required: true,
  include: [
    { model: db.Company, as: 'company', attributes: ['id', 'name'] },
    { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
  ],
});

// Companies (and their Brands) a caller can filter by.
async function listScopeCompanies(access) {
  return asGroup(async () => {
    const where = access.canManage ? { groupId: access.groupId } : { id: access.companyId };
    const companies = await db.Company.findAll({
      where,
      attributes: ['id', 'name', 'usesBrands'],
      include: [{ model: db.Brand, as: 'brands', attributes: ['id', 'name'], required: false }],
      order: [['name', 'ASC']],
    });
    return companies.map((c) => {
      const plain = c.get({ plain: true });
      if (access.scopedBrandIds) plain.brands = plain.brands.filter((b) => access.scopedBrandIds.includes(String(b.id)));
      return plain;
    });
  });
}

// Employee picker for assigning salary: every employee of the manager's Group.
async function listGroupEmployees(access, { companyId, brandId, search, limit = 50, offset = 0 }) {
  return asGroup(async () => {
    const companyIds = (await db.Company.findAll({ where: { groupId: access.groupId }, attributes: ['id'] })).map((c) => c.id);
    const where = { companyId: { [Op.in]: companyIds }, status: { [Op.notIn]: ['exited', 'archived'] } };
    if (companyId) where.companyId = companyIds.map(String).includes(String(companyId)) ? companyId : -1;
    if (brandId) where.brandId = brandId;
    if (search) Object.assign(where, employeeSearchWhere(search));
    const { rows, count } = await db.Employee.findAndCountAll({
      where,
      attributes: EMPLOYEE_ATTRS,
      include: [
        { model: db.Company, as: 'company', attributes: ['id', 'name'] },
        { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
        {
          model: db.SalaryAssignment,
          as: 'salaryAssignments',
          where: { status: 'active' },
          required: false,
          attributes: ['id', 'templateId', 'monthlyCtc', 'effectiveFrom'],
        },
      ],
      order: [['name', 'ASC']],
      limit,
      offset,
      distinct: true,
    });
    return { rows, count };
  });
}

async function listAssignments(access, { companyId, brandId, templateId, search, status = 'active', limit = 50, offset = 0 }) {
  if (!access.groupId) return { rows: [], count: 0 };
  return asGroup(async () => {
    const employeeWhere = employeeScopeWhere(access, { companyId, brandId });
    if (search) Object.assign(employeeWhere, employeeSearchWhere(search));
    const where = { groupId: access.groupId };
    if (status && status !== 'all') where.status = status;
    if (templateId) where.templateId = templateId;
    return db.SalaryAssignment.findAndCountAll({
      where,
      include: [EMPLOYEE_INCLUDE(employeeWhere), { model: db.PayrollTemplate, as: 'template', attributes: ['id', 'name'], paranoid: false }],
      order: [['effectiveFrom', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
  });
}

async function listEmployeeHistory(access, employeeId) {
  return asGroup(async () => {
    const employeeWhere = { ...employeeScopeWhere(access), id: employeeId };
    return db.SalaryAssignment.findAll({
      where: { groupId: access.groupId },
      include: [EMPLOYEE_INCLUDE(employeeWhere), { model: db.PayrollTemplate, as: 'template', attributes: ['id', 'name'], paranoid: false }],
      order: [['effectiveFrom', 'DESC']],
    });
  });
}

async function validItemKeys(groupId) {
  const items = await db.PayrollCustomItem.findAll({ where: { groupId }, attributes: ['id'] });
  return new Set([...BUILT_IN_ITEMS.map((i) => i.key), ...items.map((i) => customItemKey(i.id))]);
}

async function cleanInput(groupId, body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.templateId !== undefined) {
    const template = await db.PayrollTemplate.findOne({ where: { id: body.templateId, groupId } });
    if (!template) throw new HttpError(400, 'Choose a salary template of your Group');
    if (!template.isActive) throw new HttpError(400, 'That salary template is switched off');
    out.templateId = template.id;
  }
  if (!partial || body.ctcAmount !== undefined || body.ctcPeriod !== undefined) {
    const ctcPeriod = body.ctcPeriod === 'yearly' ? 'yearly' : 'monthly';
    const ctcAmount = Number(body.ctcAmount);
    if (!Number.isFinite(ctcAmount) || ctcAmount <= 0) throw new HttpError(400, 'Enter the CTC amount');
    out.ctcPeriod = ctcPeriod;
    out.ctcAmount = ctcAmount;
    out.monthlyCtc = Math.round((ctcPeriod === 'yearly' ? ctcAmount / 12 : ctcAmount) * 100) / 100;
  }
  if (!partial || body.deductionsEnabled !== undefined) out.deductionsEnabled = body.deductionsEnabled !== false;
  if (!partial || body.disabledItems !== undefined) {
    const valid = await validItemKeys(groupId);
    const list = Array.isArray(body.disabledItems) ? body.disabledItems : [];
    const bad = list.find((k) => !valid.has(k));
    if (bad) throw new HttpError(400, `Unknown deduction "${bad}"`);
    out.disabledItems = [...new Set(list)];
  }
  if (body.note !== undefined) out.note = body.note || null;
  return out;
}

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// New salary (or a revision): if the employee already has an active salary,
// it ends the day before the new one starts. Completed months from the start
// date onwards are generated straight away (or recalculated if they exist).
async function assignSalary(access, { body, userId }) {
  if (!isDate(body.effectiveFrom)) throw new HttpError(400, 'Choose the date this salary starts from');
  const result = await asGroup(async () => {
    const employee = await db.Employee.findByPk(body.employeeId, { attributes: EMPLOYEE_ATTRS });
    const company = employee ? await db.Company.findByPk(employee.companyId, { attributes: ['id', 'groupId'] }) : null;
    if (!employee || !company || String(company.groupId) !== String(access.groupId)) {
      throw new HttpError(404, 'Employee not found in your Group');
    }
    const input = await cleanInput(access.groupId, body);

    return db.sequelize.transaction(async (t) => {
      const active = await db.SalaryAssignment.findOne({
        where: { employeeId: employee.id, status: 'active' },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (active) {
        if (body.effectiveFrom <= active.effectiveFrom) {
          throw new HttpError(
            400,
            `The current salary started on ${active.effectiveFrom} — a new one must start after that (to fix the current one, edit it instead)`
          );
        }
        await active.update(
          { status: 'superseded', effectiveTo: addDays(body.effectiveFrom, -1), updatedByUserId: userId },
          { transaction: t }
        );
      }
      return db.SalaryAssignment.create(
        {
          ...input,
          companyId: employee.companyId,
          groupId: access.groupId,
          employeeId: employee.id,
          effectiveFrom: body.effectiveFrom,
          effectiveTo: null,
          status: 'active',
          createdByUserId: userId,
          updatedByUserId: userId,
        },
        { transaction: t }
      );
    });
  });

  await afterSalaryChange(result.employeeId, body.effectiveFrom, null);
  return result;
}

async function getAssignment(access, id) {
  const assignment = await asGroup(() => db.SalaryAssignment.findOne({ where: { id, groupId: access.groupId } }));
  if (!assignment) throw new HttpError(404, 'Salary not found');
  return assignment;
}

// Correcting a mistake in an existing salary (wrong CTC, wrong toggles, …):
// changed in place, and every generated month it covers is recalculated.
async function updateAssignment(access, { id, body, userId }) {
  const assignment = await getAssignment(access, id);
  const input = await asGroup(() => cleanInput(access.groupId, body, { partial: true }));
  await asGroup(() => assignment.update({ ...input, updatedByUserId: userId }));
  await afterSalaryChange(assignment.employeeId, assignment.effectiveFrom, assignment.effectiveTo);
  return assignment;
}

// Stops salary from a date (e.g. the employee left). Months after it won't be
// generated; the month containing it is recalculated (partial month).
async function endAssignment(access, { id, endDate, userId }) {
  const assignment = await getAssignment(access, id);
  if (assignment.status !== 'active') throw new HttpError(409, 'Only the current salary can be ended');
  if (!isDate(endDate) || endDate < assignment.effectiveFrom) {
    throw new HttpError(400, `The last salary date can't be before ${assignment.effectiveFrom}`);
  }
  await asGroup(() => assignment.update({ status: 'ended', effectiveTo: endDate, updatedByUserId: userId }));
  await afterSalaryChange(assignment.employeeId, endDate, null);
  return assignment;
}

async function afterSalaryChange(employeeId, fromDate, toDate) {
  const { year, month } = previousMonth();
  const lastEnd = monthBounds(year, month).end;
  if (fromDate > lastEnd) return;
  queuePayrollRecalc({ employeeId, fromDate, toDate: toDate && toDate < lastEnd ? toDate : lastEnd });
  setImmediate(() => {
    catchUpEmployee({ employeeId, fromDate }).catch((err) => console.error('Payroll catch-up failed:', err));
  });
}

// The salary an employee is on today (for their own dashboard).
async function getMySalary(employeeId) {
  const today = dateOnly(new Date());
  return asGroup(() =>
    db.SalaryAssignment.findOne({
      where: {
        employeeId,
        effectiveFrom: { [Op.lte]: today },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: today } }],
      },
      include: [{ model: db.PayrollTemplate, as: 'template', paranoid: false }],
      order: [['effectiveFrom', 'DESC']],
    })
  );
}

module.exports = {
  listScopeCompanies,
  listGroupEmployees,
  listAssignments,
  listEmployeeHistory,
  assignSalary,
  updateAssignment,
  endAssignment,
  getMySalary,
};
