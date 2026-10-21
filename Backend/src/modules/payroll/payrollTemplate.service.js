'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const { processPendingRecalcs } = require('./payrollEngine');
const {
  DEFAULT_RULES,
  BUILT_IN_ITEMS,
  PT_SLABS,
  normalizeRules,
  resolveCustomItems,
  computeSalary,
} = require('./payrollRules');
const { memberItemIds } = require('./customItemMembers');
const {
  employeeScopeWhere,
  scopedEmployeeWhere,
  employeeInScope,
  groupCompanyIds,
  ownerVisibleWhere,
  canEditOwner,
  ownerCoversEmployee,
  ownerForNew,
  templateVisible,
  templateEditable,
  templateCovers,
  cleanTargets,
} = require('./payrollAccess');

// Templates and custom items are not tenant-scoped; every query filters on
// group_id, and a template's TARGETS (several companies / brands, none =
// Group) or an item's OWNER level (company_id / brand_id) against the
// caller's level (payrollAccess.js): a caller sees their own level and
// above, changes only what lies wholly in their own level and below. A
// custom item is a deduction, an employer contribution, or a recurring
// allowance ('earning'), and applies only to the employees chosen on it
// (payroll_custom_item_employees) — templates don't switch it on or off.

const MAX_MEMBERS = 5000;
const asGroup = (fn) => runAsCompany(null, fn);

const OWNER_INCLUDE = [
  { model: db.Company, as: 'company', attributes: ['id', 'name'] },
  { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
];

// What the UI needs to label a row and decide whether to show edit buttons.
function withOwner(access, row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  plain.ownerLevel = plain.brandId ? 'brand' : plain.companyId ? 'company' : 'group';
  plain.canEdit = canEditOwner(access, plain);
  return plain;
}

async function listCustomItems(access) {
  if (!access.groupId) return [];
  return asGroup(async () => {
    const items = await db.PayrollCustomItem.findAll({
      where: ownerVisibleWhere(access),
      include: OWNER_INCLUDE,
      order: [['isActive', 'DESC'], ['name', 'ASC']],
    });
    // Counted within the caller's own scope only (a Group item's employees
    // in other companies are none of a Company Admin's business).
    const counts = await db.PayrollCustomItemEmployee.findAll({
      where: { groupId: access.groupId, customItemId: { [Op.in]: items.map((i) => i.id) } },
      attributes: ['customItemId', [db.sequelize.fn('COUNT', db.sequelize.col('PayrollCustomItemEmployee.id')), 'count']],
      include: [{ model: db.Employee, as: 'employee', attributes: [], where: await scopedEmployeeWhere(access), required: true }],
      group: ['customItemId'],
      raw: true,
    });
    const byItem = new Map(counts.map((c) => [String(c.customItemId), Number(c.count)]));
    return items.map((i) => ({ ...withOwner(access, i), employeeCount: byItem.get(String(i.id)) || 0 }));
  });
}

async function getCustomItem(access, id, { edit = false } = {}) {
  const item = await asGroup(() => db.PayrollCustomItem.findOne({ where: { ...ownerVisibleWhere(access), id } }));
  if (!item) throw new HttpError(404, 'Item not found');
  if (edit && !canEditOwner(access, item)) {
    throw new HttpError(403, 'This item was made at a higher level — only that level (or the Group) can change it');
  }
  return item;
}

// The employees an item applies to (for the item's form), within the
// caller's scope.
async function listCustomItemEmployees(access, id) {
  await getCustomItem(access, id);
  const rows = await asGroup(async () =>
    db.PayrollCustomItemEmployee.findAll({
      where: { groupId: access.groupId, customItemId: id },
      include: [
        {
          model: db.Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode', 'companyId', 'brandId'],
          where: await scopedEmployeeWhere(access),
          required: true,
          include: [
            { model: db.Company, as: 'company', attributes: ['id', 'name'] },
            { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
          ],
        },
      ],
    })
  );
  return rows.filter((r) => r.employee).map((r) => r.employee);
}

// employeeIds -> the ones inside both the caller's scope and the item's
// owner level (400 for anything else).
async function cleanEmployeeIds(access, owner, raw) {
  if (!Array.isArray(raw)) throw new HttpError(400, 'employeeIds must be a list');
  const ids = [...new Set(raw.filter((x) => x !== null && x !== undefined && x !== '').map(String))];
  if (ids.length > MAX_MEMBERS) throw new HttpError(400, `Choose at most ${MAX_MEMBERS} employees`);
  if (ids.length === 0) return [];
  const companyIds = await groupCompanyIds(access.groupId);
  const found = await asGroup(() =>
    db.Employee.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'companyId', 'brandId'] })
  );
  const ok = found.filter((e) => employeeInScope(access, e, companyIds) && ownerCoversEmployee(owner, e));
  if (ok.length !== ids.length) {
    throw new HttpError(400, owner.companyId ? 'Some chosen employees are outside this item’s company / brand' : 'Some chosen employees are not in your Group');
  }
  return ids;
}

async function currentMembers(itemId) {
  const rows = await db.PayrollCustomItemEmployee.findAll({ where: { customItemId: itemId }, attributes: ['employeeId'] });
  return rows.map((r) => String(r.employeeId));
}

// Replaces who the item applies to; returns { before, after } employee ids.
async function setMembers(item, ids, userId) {
  const before = await currentMembers(item.id);
  const want = new Set(ids);
  const have = new Set(before);
  const remove = before.filter((id) => !want.has(id));
  const add = ids.filter((id) => !have.has(id));
  await db.sequelize.transaction(async (t) => {
    if (remove.length > 0) {
      await db.PayrollCustomItemEmployee.destroy({ where: { customItemId: item.id, employeeId: { [Op.in]: remove } }, transaction: t });
    }
    if (add.length > 0) {
      await db.PayrollCustomItemEmployee.bulkCreate(
        add.map((employeeId) => ({ groupId: item.groupId, customItemId: item.id, employeeId, createdByUserId: userId || null })),
        { transaction: t }
      );
    }
  });
  return { before, after: ids };
}

function validateCustomItem(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new HttpError(400, 'Name is required');
  if (!['deduction', 'employer_contribution', 'earning'].includes(body.kind)) {
    throw new HttpError(400, "kind must be 'deduction', 'employer_contribution' or 'earning'");
  }
  if (!['percent', 'fixed'].includes(body.calcType)) throw new HttpError(400, "calcType must be 'percent' or 'fixed'");
  const value = Number(body.value);
  if (!Number.isFinite(value) || value < 0) throw new HttpError(400, 'Value must be a positive number');
  if (body.calcType === 'percent') {
    if (!['basic', 'gross', 'ctc'].includes(body.basis)) throw new HttpError(400, "basis must be 'basic', 'gross' or 'ctc'");
    if (value > 100) throw new HttpError(400, 'A percentage cannot be more than 100');
  }
  return {
    name,
    kind: body.kind,
    calcType: body.calcType,
    basis: body.calcType === 'percent' ? body.basis : null,
    value,
    months: cleanMonths(body.months),
    isActive: body.isActive !== false,
  };
}

// null / empty = every month; otherwise only those 'YYYY-MM' months.
function cleanMonths(months) {
  if (months === undefined || months === null) return null;
  if (!Array.isArray(months)) throw new HttpError(400, 'months must be a list like ["2026-10"]');
  const clean = [...new Set(months.map(String))].sort();
  if (clean.length === 0) return null;
  if (clean.length > 60) throw new HttpError(400, 'Choose at most 60 months');
  const bad = clean.find((m) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m));
  if (bad) throw new HttpError(400, `"${bad}" is not a month (use YYYY-MM)`);
  return clean;
}

// An item limited to some months changes the payroll of exactly those
// months, for its employees (before and after the change) — any of those
// months already generated is recalculated (the difference reaches the next
// salary as arrears / recovery). An every-month item changes payroll from
// the next generated month; months already generated keep their snapshot.
function recalcItemMonths(groupId, employeeIds, ...monthLists) {
  const months = [...new Set(monthLists.flat().filter(Boolean))];
  const ids = [...new Set(employeeIds.map(String))];
  if (months.length === 0 || ids.length === 0) return;
  setImmediate(async () => {
    try {
      await runAsCompany(null, () =>
        db.EmployeePayroll.update(
          { needsRecalc: true },
          {
            where: {
              groupId,
              employeeId: { [Op.in]: ids },
              [Op.or]: months.map((m) => ({ periodYear: Number(m.slice(0, 4)), periodMonth: Number(m.slice(5, 7)) })),
            },
          }
        )
      );
      await processPendingRecalcs();
    } catch (err) {
      console.error('Payroll recalculation after an item change failed:', err);
    }
  });
}

async function createCustomItem(access, { body, userId }) {
  const values = validateCustomItem(body);
  const owner = await ownerForNew(access, body);
  const ids = await cleanEmployeeIds(access, owner, body.employeeIds || []);
  const item = await db.PayrollCustomItem.create({ ...values, ...owner, groupId: access.groupId, createdByUserId: userId });
  await setMembers(item, ids, userId);
  recalcItemMonths(access.groupId, ids, item.months);
  return withOwner(access, item);
}

// The owner level of an existing item never changes.
async function updateCustomItem(access, { id, body, userId }) {
  const item = await getCustomItem(access, id, { edit: true });
  const beforeMonths = item.months;
  const ids = body.employeeIds !== undefined ? await cleanEmployeeIds(access, item, body.employeeIds) : null;
  await item.update(validateCustomItem({ ...item.get({ plain: true }), ...body }));
  const { before, after } = ids ? await setMembers(item, ids, userId) : { before: await currentMembers(item.id), after: [] };
  recalcItemMonths(access.groupId, [...before, ...after], beforeMonths, item.months);
  return withOwner(access, item);
}

async function deleteCustomItem(access, { id }) {
  const item = await getCustomItem(access, id, { edit: true });
  const members = await currentMembers(item.id);
  await db.sequelize.transaction(async (t) => {
    await db.PayrollCustomItemEmployee.destroy({ where: { customItemId: item.id }, transaction: t });
    await item.destroy({ transaction: t });
  });
  recalcItemMonths(access.groupId, members, item.months);
}

// Templates as the UI needs them: targets named, a short level, canEdit.
async function presentTemplates(access, templates) {
  const companyIds = new Set();
  const brandIds = new Set();
  for (const t of templates) {
    for (const x of t.targets || []) {
      companyIds.add(String(x.companyId));
      if (x.brandId) brandIds.add(String(x.brandId));
    }
  }
  const [companies, brands] = await asGroup(() =>
    Promise.all([
      companyIds.size ? db.Company.findAll({ where: { id: { [Op.in]: [...companyIds] } }, attributes: ['id', 'name'] }) : [],
      brandIds.size ? db.Brand.findAll({ where: { id: { [Op.in]: [...brandIds] } }, attributes: ['id', 'name'] }) : [],
    ])
  );
  const companyName = new Map(companies.map((c) => [String(c.id), c.name]));
  const brandName = new Map(brands.map((b) => [String(b.id), b.name]));
  return templates.map((t) => {
    const plain = t.get ? t.get({ plain: true }) : t;
    const targets = (plain.targets || []).map((x) => ({
      companyId: String(x.companyId),
      brandId: x.brandId ? String(x.brandId) : null,
      companyName: companyName.get(String(x.companyId)) || null,
      brandName: x.brandId ? brandName.get(String(x.brandId)) || null : null,
    }));
    return {
      ...plain,
      targets,
      ownerLevel: targets.length === 0 ? 'group' : targets.every((x) => x.brandId) ? 'brand' : 'company',
      canEdit: templateEditable(access, plain),
      rules: normalizeRules(plain.rules),
    };
  });
}

// Every template of the Group the caller can see (a Group has a handful —
// filtered here rather than in SQL, since targets is a JSONB list).
async function visibleTemplates(access) {
  const rows = await asGroup(() => db.PayrollTemplate.findAll({ where: { groupId: access.groupId }, order: [['name', 'ASC']] }));
  return rows.filter((t) => templateVisible(access, t));
}

async function listTemplates(access) {
  if (!access.groupId) return [];
  const templates = await visibleTemplates(access);
  // Employees on it, counted within the caller's scope.
  const counts = await asGroup(() =>
    db.SalaryAssignment.findAll({
      where: { templateId: { [Op.in]: templates.map((t) => t.id) }, status: 'active' },
      attributes: ['templateId', [db.sequelize.fn('COUNT', db.sequelize.col('SalaryAssignment.id')), 'count']],
      include: [{ model: db.Employee, as: 'employee', attributes: [], where: employeeScopeWhere(access), required: true }],
      group: ['templateId'],
      raw: true,
    })
  );
  const countByTemplate = new Map(counts.map((c) => [String(c.templateId), Number(c.count)]));
  return (await presentTemplates(access, templates)).map((t) => ({ ...t, activeEmployees: countByTemplate.get(String(t.id)) || 0 }));
}

async function getTemplate(access, id, { edit = false } = {}) {
  const template = await asGroup(() => db.PayrollTemplate.findOne({ where: { id, groupId: access.groupId } }));
  if (!template || !templateVisible(access, template)) throw new HttpError(404, 'Salary template not found');
  if (edit && !templateEditable(access, template)) {
    throw new HttpError(403, 'This template is shared beyond your company / brand — only the level above (or the Group) can change it');
  }
  return template;
}

function cleanName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) throw new HttpError(400, 'Template name is required');
  return value;
}

// Unique among the templates the caller can see (two companies may each
// keep their own "Standard"; a Group-level caller sees all, so unique there).
async function assertNameFree(access, name, exceptId) {
  const clash = (await visibleTemplates(access)).find(
    (t) => String(t.id) !== String(exceptId || '') && t.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (clash) throw new HttpError(409, 'A template with this name already exists');
}

async function createTemplate(access, { body, userId }) {
  const name = cleanName(body.name);
  const targets = await cleanTargets(access, body.targets);
  await assertNameFree(access, name);
  const template = await db.PayrollTemplate.create({
    groupId: access.groupId,
    targets,
    name,
    description: body.description || null,
    rules: normalizeRules(body.rules),
    isActive: body.isActive !== false,
    createdByUserId: userId,
    updatedByUserId: userId,
  });
  return (await presentTemplates(access, [template]))[0];
}

// Editing a template changes every employee on it from their next generated
// month — months already generated keep the snapshot they were made with.
// Targets can change too, but never so that someone already paid on it
// falls outside them.
async function updateTemplate(access, { id, body, userId }) {
  const template = await getTemplate(access, id, { edit: true });
  const updates = { updatedByUserId: userId };
  if (body.name !== undefined) {
    updates.name = cleanName(body.name);
    await assertNameFree(access, updates.name, template.id);
  }
  if (body.targets !== undefined) {
    updates.targets = await cleanTargets(access, body.targets);
    const onIt = await asGroup(() =>
      db.SalaryAssignment.findAll({
        where: { templateId: template.id, status: 'active' },
        include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'name', 'companyId', 'brandId'], required: true }],
      })
    );
    const left = onIt.filter((a) => !templateCovers({ targets: updates.targets }, a.employee));
    if (left.length > 0) {
      const names = left.slice(0, 3).map((a) => a.employee.name).join(', ');
      throw new HttpError(
        409,
        `${left.length} employee(s) paid on this template would fall outside it (${names}${left.length > 3 ? '…' : ''}) — move them to another template first`
      );
    }
  }
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.rules !== undefined) updates.rules = normalizeRules(body.rules);
  if (body.isActive !== undefined) updates.isActive = body.isActive !== false;
  await template.update(updates);
  return (await presentTemplates(access, [template]))[0];
}

async function deleteTemplate(access, { id }) {
  const template = await getTemplate(access, id, { edit: true });
  const inUse = await asGroup(() => db.SalaryAssignment.count({ where: { templateId: template.id, status: 'active' } }));
  if (inUse > 0) {
    throw new HttpError(409, `${inUse} employee(s) are still paid on this template — move them to another template first`);
  }
  await template.destroy();
}

// Defaults for a new-template form.
async function getTemplateDefaults() {
  return {
    rules: DEFAULT_RULES,
    builtInItems: BUILT_IN_ITEMS,
    ptStates: Object.keys(PT_SLABS),
  };
}

// Live calculation for the template form / assign form: either `rules` (a
// template being edited) or `templateId`. With `employeeId`, that employee's
// every-month extra items are included; without, the template alone.
async function previewSalary(access, { body }) {
  const { groupId } = access;
  let rules;
  if (body.templateId) rules = normalizeRules((await getTemplate(access, body.templateId)).rules);
  else rules = normalizeRules(body.rules);
  const monthlyCtc = body.ctcPeriod === 'yearly' ? Number(body.ctcAmount) / 12 : Number(body.ctcAmount ?? body.monthlyCtc);
  if (!Number.isFinite(monthlyCtc) || monthlyCtc <= 0) throw new HttpError(400, 'Enter a CTC amount');
  const limited = (i) => Array.isArray(i.months) && i.months.length > 0;
  let myItems = [];
  if (body.employeeId) {
    const employee = await asGroup(() => db.Employee.findByPk(body.employeeId, { attributes: ['id', 'companyId', 'brandId'] }));
    if (!employeeInScope(access, employee, await groupCompanyIds(groupId))) throw new HttpError(404, 'Employee not found');
    const mine = (await memberItemIds([body.employeeId])).get(String(body.employeeId));
    myItems = (await db.PayrollCustomItem.findAll({ where: { groupId, isActive: true } }))
      .map((i) => i.get({ plain: true }))
      .filter((i) => mine.has(String(i.id)));
  }
  const calc = (items, bonuses = []) =>
    computeSalary({
      monthlyCtc,
      rules,
      customItems: resolveCustomItems(rules, items),
      deductionsEnabled: body.deductionsEnabled !== false,
      disabledItems: Array.isArray(body.disabledItems) ? body.disabledItems : [],
      workState: body.workState || null,
      bonuses,
    });
  const regular = myItems.filter((i) => !limited(i));
  const result = calc(regular);
  if (body.employeeId) result.months = await previewMonths({ employeeId: body.employeeId, myItems, regular, calc });
  return result;
}

// The months from now on where this employee's in-hand differs from the
// regular month — a month-limited item or a bonus falls in it. Full month,
// no LOP; TDS is the regular projection (the real payroll uses the year so far).
async function previewMonths({ employeeId, myItems, regular, calc }) {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const bonuses = await runAsCompany(null, () =>
    db.PayrollBonus.findAll({
      where: {
        employeeId,
        [Op.or]: [
          { periodYear: { [Op.gt]: now.getFullYear() } },
          { periodYear: now.getFullYear(), periodMonth: { [Op.gte]: now.getMonth() + 1 } },
        ],
      },
    })
  );
  const keyOf = (b) => `${b.periodYear}-${String(b.periodMonth).padStart(2, '0')}`;
  const keys = new Set(bonuses.map(keyOf));
  for (const i of myItems) for (const m of i.months || []) if (m >= current) keys.add(m);
  return [...keys].sort().slice(0, 24).map((key) => {
    const monthItems = [...regular, ...myItems.filter((i) => (i.months || []).includes(key))];
    const monthBonuses = bonuses
      .filter((b) => keyOf(b) === key)
      .map((b) => ({
        id: b.id,
        type: b.type,
        title: b.title,
        amount: Number(b.amount),
        taxable: b.taxable,
        calcType: b.calcType,
        percent: b.percent,
        basis: b.basis,
      }));
    const s = calc(monthItems, monthBonuses);
    return {
      month: key,
      extras: [
        ...myItems.filter((i) => (i.months || []).includes(key)).map((i) => i.name),
        ...monthBonuses.map((b) => b.title || b.type),
      ],
      grossSalary: s.actual.grossSalary,
      bonusTotal: s.actual.bonusTotal,
      totalDeductions: s.actual.totalDeductions,
      inHand: s.actual.inHand,
    };
  });
}

module.exports = {
  listCustomItems,
  listCustomItemEmployees,
  createCustomItem,
  updateCustomItem,
  deleteCustomItem,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateDefaults,
  previewSalary,
};
