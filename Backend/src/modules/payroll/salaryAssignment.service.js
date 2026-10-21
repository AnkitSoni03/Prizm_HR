'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const { addDays, dateOnly } = require('../../utils/dateRange');
const { employeeSearchWhere } = require('../../utils/employeeSearch');
const { BUILT_IN_ITEMS } = require('./payrollRules');
const {
  employeeScopeWhere,
  scopedEmployeeWhere,
  employeeInScope,
  groupCompanyIds,
  templateVisible,
  templateCovers,
  canEditOwner,
  salaryOwner,
  ownerLevelOf,
  callerOwnerFor,
  canChangeSalary,
} = require('./payrollAccess');
const { catchUpEmployee, queuePayrollRecalc, recalculatePayroll, previousMonth, monthBounds, generateEmployeeMonth, isMonthComplete } = require('./payrollEngine');

// Every query here runs with the tenant hook off — a Group-level caller
// works across all companies of their Group; Company / Brand-level callers
// (manage or view) are bounded by employeeScopeWhere / employeeInScope.
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
    const where = access.level === 'group' ? { groupId: access.groupId } : { id: access.companyId };
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

// Employee picker for assigning salary: every employee in the manager's
// scope (whole Group / own company / own brand).
async function listGroupEmployees(access, { companyId, brandId, search, limit = 50, offset = 0 }) {
  return asGroup(async () => {
    const where = { ...(await scopedEmployeeWhere(access)), status: { [Op.notIn]: ['exited', 'archived'] } };
    if (companyId) {
      if (access.level === 'group') {
        where.companyId = (await groupCompanyIds(access.groupId)).includes(String(companyId)) ? companyId : -1;
      } else if (String(companyId) !== access.companyId) {
        where.companyId = -1;
      }
    }
    if (brandId) where.brandId = access.scopedBrandIds && !access.scopedBrandIds.includes(String(brandId)) ? -1 : brandId;
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
          attributes: ['id', 'templateId', 'monthlyCtc', 'effectiveFrom', 'ownerCompanyId', 'ownerBrandId'],
        },
      ],
      order: [['name', 'ASC']],
      limit,
      offset,
      distinct: true,
    });
    const pending = await pendingReleaseFor(access, rows);
    return {
      rows: rows.map((e) => {
        const active = e.salaryAssignments[0];
        return {
          ...e.get({ plain: true }),
          ...lockInfo(access, active),
          releaseRequested: pending.has(String(e.id)),
        };
      }),
      count,
    };
  });
}

// Who owns an employee's current salary and whether the caller may change
// it: { ownerLevel: 'group' | 'company' | 'brand' | null, locked }.
function lockInfo(access, active) {
  if (!active) return { ownerLevel: null, locked: false };
  return { ownerLevel: ownerLevelOf(salaryOwner(active)), locked: !canChangeSalary(access, active) };
}

// Employee ids (of `employees`) with a release request from the caller's own
// level still waiting.
async function pendingReleaseFor(access, employees) {
  if (access.level === 'group' || employees.length === 0) return new Set();
  const requests = await db.PayrollReleaseRequest.findAll({
    where: { employeeId: { [Op.in]: employees.map((e) => e.id) }, status: 'pending', toCompanyId: access.companyId },
    attributes: ['employeeId', 'toBrandId'],
  });
  const byId = new Map(employees.map((e) => [String(e.id), e]));
  const out = new Set();
  for (const r of requests) {
    const target = callerOwnerFor(access, byId.get(String(r.employeeId)));
    if (String(r.toBrandId ?? '') === String(target.brandId ?? '')) out.add(String(r.employeeId));
  }
  return out;
}

async function listAssignments(access, { companyId, brandId, templateId, search, status = 'active', limit = 50, offset = 0 }) {
  if (!access.groupId) return { rows: [], count: 0 };
  return asGroup(async () => {
    const employeeWhere = employeeScopeWhere(access, { companyId, brandId });
    if (search) Object.assign(employeeWhere, employeeSearchWhere(search));
    const where = { groupId: access.groupId };
    if (status && status !== 'all') where.status = status;
    if (templateId) where.templateId = templateId;
    const { rows, count } = await db.SalaryAssignment.findAndCountAll({
      where,
      include: [EMPLOYEE_INCLUDE(employeeWhere), { model: db.PayrollTemplate, as: 'template', attributes: ['id', 'name'], paranoid: false }],
      order: [['effectiveFrom', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
    const extras = await employeeExtras(access.groupId, rows.map((r) => r.employeeId));
    const pending = await pendingReleaseFor(access, rows.filter((r) => r.status === 'active').map((r) => r.employee));
    return {
      rows: rows.map((r) => ({
        ...r.get({ plain: true }),
        extras: extras.get(String(r.employeeId)),
        ownerLevel: ownerLevelOf(salaryOwner(r)),
        canEdit: canEditOwner(access, salaryOwner(r)),
        releaseRequested: r.status === 'active' && pending.has(String(r.employeeId)),
      })),
      count,
    };
  });
}

// What each employee gets on top of their template: the extra items they
// were chosen for (active ones) and their bonuses from this month on.
async function employeeExtras(groupId, employeeIds) {
  const ids = [...new Set(employeeIds.map(String))];
  const out = new Map(ids.map((id) => [id, { items: [], bonuses: [] }]));
  if (ids.length === 0) return out;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [members, bonuses] = await Promise.all([
    db.PayrollCustomItemEmployee.findAll({
      where: { groupId, employeeId: { [Op.in]: ids } },
      include: [
        {
          model: db.PayrollCustomItem,
          as: 'item',
          where: { isActive: true },
          attributes: ['id', 'name', 'kind', 'calcType', 'basis', 'value', 'months'],
        },
      ],
    }),
    db.PayrollBonus.findAll({
      where: {
        groupId,
        employeeId: { [Op.in]: ids },
        [Op.or]: [{ periodYear: { [Op.gt]: year } }, { periodYear: year, periodMonth: { [Op.gte]: month } }],
      },
      attributes: ['id', 'employeeId', 'type', 'title', 'calcType', 'percent', 'basis', 'amount', 'periodYear', 'periodMonth'],
      order: [['periodYear', 'ASC'], ['periodMonth', 'ASC']],
    }),
  ]);
  for (const m of members) {
    const i = m.item;
    out.get(String(m.employeeId)).items.push({
      id: String(i.id),
      name: i.name,
      kind: i.kind,
      calcType: i.calcType,
      basis: i.basis,
      value: Number(i.value),
      months: i.months,
    });
  }
  for (const b of bonuses) out.get(String(b.employeeId)).bonuses.push(b.get({ plain: true }));
  return out;
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

// Only built-in items can be switched off per salary — extra items apply to
// the employees chosen on the item itself.
const VALID_ITEM_KEYS = new Set(BUILT_IN_ITEMS.map((i) => i.key));

// `template` (when one was chosen) is returned alongside so the caller can
// check it covers the employee (templateCovers) — a template made for some
// companies / brands can't pay anyone outside them.
async function cleanInput(access, body, { partial = false } = {}) {
  const out = {};
  let template = null;
  if (!partial || body.templateId !== undefined) {
    template = await db.PayrollTemplate.findOne({ where: { id: body.templateId, groupId: access.groupId } });
    if (!template || !templateVisible(access, template)) throw new HttpError(400, 'Choose one of your salary templates');
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
    const list = (Array.isArray(body.disabledItems) ? body.disabledItems : []).filter((k) => !String(k).startsWith('custom_'));
    const bad = list.find((k) => !VALID_ITEM_KEYS.has(k));
    if (bad) throw new HttpError(400, `Unknown deduction "${bad}"`);
    out.disabledItems = [...new Set(list)];
  }
  if (body.note !== undefined) out.note = body.note || null;
  return { input: out, template };
}

const NOT_COVERED = 'That template is not made for this employee’s company / brand — choose one that applies to them';

// The employee (by id), or 404 when outside the caller's scope.
async function findEmployeeInScope(access, employeeId) {
  const employee = await db.Employee.findByPk(employeeId, { attributes: EMPLOYEE_ATTRS });
  const companyIds = access.level === 'group' ? await groupCompanyIds(access.groupId) : null;
  if (!employeeInScope(access, employee, companyIds)) throw new HttpError(404, 'Employee not found in your payroll scope');
  return employee;
}

const LEVEL_NAMES = { group: 'the Group', company: 'their company', brand: 'their brand' };

// A salary owned above the caller's level: they ask for a release instead.
function lockedError(assignment) {
  const level = ownerLevelOf(salaryOwner(assignment));
  return new HttpError(409, `Salary is managed by ${LEVEL_NAMES[level]} — request a release first`, 'SALARY_LOCKED');
}

const ownerColumns = (owner) => ({ ownerCompanyId: owner.companyId, ownerBrandId: owner.brandId });

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Creates the salary row for one employee inside its own transaction; an
// active salary is superseded (ends the day before the new one starts).
async function createAssignmentFor({ access, employee, input, effectiveFrom, userId }) {
  return db.sequelize.transaction(async (t) => {
    const active = await db.SalaryAssignment.findOne({
      where: { employeeId: employee.id, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (active) {
      if (!canChangeSalary(access, active)) throw lockedError(active);
      if (effectiveFrom <= active.effectiveFrom) {
        throw new HttpError(
          400,
          `The current salary started on ${active.effectiveFrom} — a new one must start after that (to fix the current one, edit it instead)`
        );
      }
      await active.update(
        { status: 'superseded', effectiveTo: addDays(effectiveFrom, -1), updatedByUserId: userId },
        { transaction: t }
      );
    }
    return db.SalaryAssignment.create(
      {
        ...input,
        companyId: employee.companyId,
        groupId: access.groupId,
        ...ownerColumns(callerOwnerFor(access, employee)),
        employeeId: employee.id,
        effectiveFrom,
        effectiveTo: null,
        status: 'active',
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      { transaction: t }
    );
  });
}

// New salary (or a revision): if the employee already has an active salary,
// it ends the day before the new one starts. Completed months from the start
// date onwards are generated straight away (or recalculated if they exist).
async function assignSalary(access, { body, userId }) {
  if (!isDate(body.effectiveFrom)) throw new HttpError(400, 'Choose the date this salary starts from');
  const result = await asGroup(async () => {
    const employee = await findEmployeeInScope(access, body.employeeId);
    const { input, template } = await cleanInput(access, body);
    if (!templateCovers(template, employee)) throw new HttpError(400, NOT_COVERED);
    return createAssignmentFor({ access, employee, input, effectiveFrom: body.effectiveFrom, userId });
  });

  await afterSalaryChange(result.employeeId, body.effectiveFrom, null);
  return result;
}

const MAX_BULK = 2000;

// The same template / start date / deduction switches for many employees,
// each with their own CTC: body.items = [{ employeeId, ctcAmount }]. One
// employee's problem (outside the caller's scope or the template's, no CTC,
// a start date before their current salary's) skips just them and is
// reported back.
async function bulkAssignSalary(access, { body, userId }) {
  if (!isDate(body.effectiveFrom)) throw new HttpError(400, 'Choose the date this salary starts from');
  const items = Array.isArray(body.items) ? body.items : [];
  const seen = new Set();
  const unique = items.filter((i) => {
    const id = i && i.employeeId !== undefined && i.employeeId !== null ? String(i.employeeId) : '';
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (unique.length === 0) throw new HttpError(400, 'Choose at least one employee');
  if (unique.length > MAX_BULK) throw new HttpError(400, `Choose at most ${MAX_BULK} employees at a time`);

  const { created, skipped } = await asGroup(async () => {
    // Template, switches and items are checked once; CTC per employee below.
    const { input: shared, template } = await cleanInput(access, { ...body, ctcAmount: 1 });
    delete shared.ctcAmount;
    delete shared.monthlyCtc;
    const { ctcPeriod } = shared;

    const employees = await db.Employee.findAll({
      where: { ...(await scopedEmployeeWhere(access)), id: { [Op.in]: unique.map((i) => String(i.employeeId)) } },
      attributes: EMPLOYEE_ATTRS,
    });
    const byId = new Map(employees.map((e) => [String(e.id), e]));

    const createdRows = [];
    const skippedRows = [];
    for (const item of unique) {
      const id = String(item.employeeId);
      const employee = byId.get(id);
      const skip = (reason) =>
        skippedRows.push({
          employeeId: id,
          name: employee ? employee.name : null,
          employeeCode: employee ? employee.employeeCode : null,
          reason,
        });
      if (!employee) {
        skip('Not in your payroll scope');
        continue;
      }
      if (!templateCovers(template, employee)) {
        skip('The template is not made for their company / brand');
        continue;
      }
      const ctcAmount = Number(item.ctcAmount);
      if (!Number.isFinite(ctcAmount) || ctcAmount <= 0) {
        skip('No CTC entered');
        continue;
      }
      const input = {
        ...shared,
        ctcAmount,
        monthlyCtc: Math.round((ctcPeriod === 'yearly' ? ctcAmount / 12 : ctcAmount) * 100) / 100,
      };
      try {
        // eslint-disable-next-line no-await-in-loop
        createdRows.push(await createAssignmentFor({ access, employee, input, effectiveFrom: body.effectiveFrom, userId }));
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        skip(err.message);
      }
    }
    return { created: createdRows, skipped: skippedRows };
  });

  // Past months: one employee after another, never hundreds at once.
  if (created.length > 0) {
    setImmediate(async () => {
      for (const a of created) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await syncSalaryMonths(a.employeeId, body.effectiveFrom);
        } catch (err) {
          console.error(`Payroll catch-up failed for employee ${a.employeeId}:`, err);
        }
      }
    });
  }
  return { created, skipped };
}

async function getAssignment(access, id) {
  const assignment = await asGroup(() =>
    db.SalaryAssignment.findOne({ where: { id, groupId: access.groupId }, include: [EMPLOYEE_INCLUDE(employeeScopeWhere(access))] })
  );
  if (!assignment) throw new HttpError(404, 'Salary not found');
  return assignment;
}

// Correcting a mistake in an existing salary (wrong CTC, wrong toggles, …):
// changed in place, and every generated month it covers is recalculated.
async function updateAssignment(access, { id, body, userId }) {
  const assignment = await getAssignment(access, id);
  if (!canChangeSalary(access, assignment)) throw lockedError(assignment);
  const { input, template } = await asGroup(() => cleanInput(access, body, { partial: true }));
  if (template && !templateCovers(template, assignment.employee)) throw new HttpError(400, NOT_COVERED);
  await asGroup(() => assignment.update({ ...input, updatedByUserId: userId }));
  await afterSalaryChange(assignment.employeeId, assignment.effectiveFrom, assignment.effectiveTo);
  return assignment;
}

// Stops salary from a date (e.g. the employee left). Months after it won't be
// generated; the month containing it is recalculated (partial month).
async function endAssignment(access, { id, endDate, userId }) {
  const assignment = await getAssignment(access, id);
  if (!canChangeSalary(access, assignment)) throw lockedError(assignment);
  if (assignment.status !== 'active') throw new HttpError(409, 'Only the current salary can be ended');
  if (!isDate(endDate) || endDate < assignment.effectiveFrom) {
    throw new HttpError(400, `The last salary date can't be before ${assignment.effectiveFrom}`);
  }
  await asGroup(() => assignment.update({ status: 'ended', effectiveTo: endDate, updatedByUserId: userId }));
  await afterSalaryChange(assignment.employeeId, endDate, null);
  // Final settlement: when the last date is today or earlier and its month is
  // still running, that month's salary (up to the last date) is made now.
  // A later last date is settled by the daily job the day after it.
  let finalPayroll = null;
  const [y, m] = endDate.split('-').map(Number);
  if (endDate <= dateOnly(new Date()) && !isMonthComplete(y, m)) {
    finalPayroll = await generateEmployeeMonth({ employeeId: assignment.employeeId, year: y, month: m });
    if (finalPayroll) {
      finalPayroll = await asGroup(() => db.EmployeePayroll.findByPk(finalPayroll.id, { attributes: { exclude: ['rulesSnapshot'] } }));
    }
  }
  return { assignment, finalPayroll };
}

// Awaitable version of afterSalaryChange for bulk work: recalculates the
// already-generated months from `fromDate`, then generates missing ones.
async function syncSalaryMonths(employeeId, fromDate) {
  const { year, month } = previousMonth();
  const lastEnd = monthBounds(year, month).end;
  if (fromDate > lastEnd) return;
  const [fy, fm] = fromDate.split('-').map(Number);
  const rows = await asGroup(() =>
    db.EmployeePayroll.findAll({
      where: {
        employeeId,
        [Op.or]: [{ periodYear: { [Op.gt]: fy } }, { periodYear: fy, periodMonth: { [Op.gte]: fm } }],
      },
      attributes: ['id'],
    })
  );
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    await recalculatePayroll(row.id);
  }
  await catchUpEmployee({ employeeId, fromDate });
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
  bulkAssignSalary,
  updateAssignment,
  endAssignment,
  getMySalary,
};
