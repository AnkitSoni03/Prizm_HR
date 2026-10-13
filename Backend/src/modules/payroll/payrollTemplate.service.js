'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const {
  DEFAULT_RULES,
  BUILT_IN_ITEMS,
  PT_SLABS,
  customItemKey,
  normalizeRules,
  resolveCustomItems,
  computeSalary,
} = require('./payrollRules');

// Templates and custom items are group-level (no company_id, not
// tenant-scoped); every query filters on group_id.

async function listCustomItems(groupId) {
  if (!groupId) return [];
  return db.PayrollCustomItem.findAll({ where: { groupId }, order: [['isActive', 'DESC'], ['name', 'ASC']] });
}

function validateCustomItem(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new HttpError(400, 'Name is required');
  if (!['deduction', 'employer_contribution'].includes(body.kind)) {
    throw new HttpError(400, "kind must be 'deduction' or 'employer_contribution'");
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
    isActive: body.isActive !== false,
  };
}

async function createCustomItem({ groupId, body, userId }) {
  return db.PayrollCustomItem.create({ ...validateCustomItem(body), groupId, createdByUserId: userId });
}

async function updateCustomItem({ groupId, id, body }) {
  const item = await db.PayrollCustomItem.findOne({ where: { id, groupId } });
  if (!item) throw new HttpError(404, 'Item not found');
  await item.update(validateCustomItem({ ...item.get({ plain: true }), ...body }));
  return item;
}

async function deleteCustomItem({ groupId, id }) {
  const item = await db.PayrollCustomItem.findOne({ where: { id, groupId } });
  if (!item) throw new HttpError(404, 'Item not found');
  await item.destroy();
}

async function listTemplates(groupId) {
  if (!groupId) return [];
  const templates = await db.PayrollTemplate.findAll({ where: { groupId }, order: [['name', 'ASC']] });
  const counts = await runAsCompany(null, () =>
    db.SalaryAssignment.findAll({
      where: { templateId: { [Op.in]: templates.map((t) => t.id) }, status: 'active' },
      attributes: ['templateId', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
      group: ['templateId'],
      raw: true,
    })
  );
  const countByTemplate = new Map(counts.map((c) => [String(c.templateId), Number(c.count)]));
  return templates.map((t) => ({
    ...t.get({ plain: true }),
    rules: normalizeRules(t.rules),
    activeEmployees: countByTemplate.get(String(t.id)) || 0,
  }));
}

async function getTemplate({ groupId, id }) {
  const template = await db.PayrollTemplate.findOne({ where: { id, groupId } });
  if (!template) throw new HttpError(404, 'Salary template not found');
  return template;
}

function cleanName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) throw new HttpError(400, 'Template name is required');
  return value;
}

async function assertNameFree(groupId, name, exceptId) {
  const clash = await db.PayrollTemplate.findOne({
    where: {
      groupId,
      ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}),
      [Op.and]: [db.sequelize.where(db.sequelize.fn('lower', db.sequelize.col('name')), name.toLowerCase())],
    },
  });
  if (clash) throw new HttpError(409, 'A template with this name already exists');
}

async function createTemplate({ groupId, body, userId }) {
  const name = cleanName(body.name);
  await assertNameFree(groupId, name);
  return db.PayrollTemplate.create({
    groupId,
    name,
    description: body.description || null,
    rules: normalizeRules(body.rules),
    isActive: body.isActive !== false,
    createdByUserId: userId,
    updatedByUserId: userId,
  });
}

// Editing a template changes every employee on it from their next generated
// month — months already generated keep the snapshot they were made with.
async function updateTemplate({ groupId, id, body, userId }) {
  const template = await getTemplate({ groupId, id });
  const updates = { updatedByUserId: userId };
  if (body.name !== undefined) {
    updates.name = cleanName(body.name);
    await assertNameFree(groupId, updates.name, template.id);
  }
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.rules !== undefined) updates.rules = normalizeRules(body.rules);
  if (body.isActive !== undefined) updates.isActive = body.isActive !== false;
  await template.update(updates);
  return template;
}

async function deleteTemplate({ groupId, id }) {
  const template = await getTemplate({ groupId, id });
  const inUse = await runAsCompany(null, () => db.SalaryAssignment.count({ where: { templateId: template.id, status: 'active' } }));
  if (inUse > 0) {
    throw new HttpError(409, `${inUse} employee(s) are still paid on this template — move them to another template first`);
  }
  await template.destroy();
}

// Defaults + item catalogue for a new-template form.
async function getTemplateDefaults(groupId) {
  const items = await listCustomItems(groupId);
  return {
    rules: DEFAULT_RULES,
    builtInItems: BUILT_IN_ITEMS,
    customItems: items.filter((i) => i.isActive).map((i) => ({ ...i.get({ plain: true }), key: customItemKey(i.id) })),
    ptStates: Object.keys(PT_SLABS),
  };
}

// Live calculation for the template form / assign form: either `rules` (a
// template being edited) or `templateId`.
async function previewSalary({ groupId, body }) {
  let rules;
  if (body.templateId) rules = normalizeRules((await getTemplate({ groupId, id: body.templateId })).rules);
  else rules = normalizeRules(body.rules);
  const monthlyCtc = body.ctcPeriod === 'yearly' ? Number(body.ctcAmount) / 12 : Number(body.ctcAmount ?? body.monthlyCtc);
  if (!Number.isFinite(monthlyCtc) || monthlyCtc <= 0) throw new HttpError(400, 'Enter a CTC amount');
  const items = (await listCustomItems(groupId)).filter((i) => i.isActive).map((i) => i.get({ plain: true }));
  return computeSalary({
    monthlyCtc,
    rules,
    customItems: resolveCustomItems(rules, items),
    deductionsEnabled: body.deductionsEnabled !== false,
    disabledItems: Array.isArray(body.disabledItems) ? body.disabledItems : [],
    workState: body.workState || null,
  });
}

module.exports = {
  listCustomItems,
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
