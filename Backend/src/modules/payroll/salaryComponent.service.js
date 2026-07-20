'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function listComponents({ companyId, includeInactive }) {
  const where = {};
  if (!includeInactive) where.isActive = true;
  // Relies on SalaryComponentDefinition's tenant-scope hook for company_id
  // filtering.
  return db.SalaryComponentDefinition.findAll({
    where,
    order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    include: [{ model: db.SalaryComponentDefinition, as: 'percentageOfComponent', attributes: ['id', 'code', 'name'] }],
  });
}

async function getComponentForWrite({ companyId, id }) {
  const component = await db.SalaryComponentDefinition.findOne({ where: { id, companyId } });
  if (!component) throw new HttpError(404, 'Salary component not found');
  return component;
}

// calculationType/percentageOfComponentId are fixed at creation — a
// component's *shape* (fixed vs percentage-of-X) is a catalog decision, not
// something an individual structure assignment can override. Only the
// numeric value varies per employee (see salaryStructure.service.js).
async function createComponent({
  companyId,
  code,
  name,
  componentCategory,
  calculationType,
  defaultValue,
  percentageOfComponentId,
  displayOrder,
  isPfWage,
}) {
  if (calculationType === 'formula') {
    throw new HttpError(400, 'Formula-based components are not yet supported');
  }
  if (calculationType === 'percentage_of_component') {
    if (!percentageOfComponentId) {
      throw new HttpError(400, 'percentageOfComponentId is required for a percentage-of-component');
    }
    const reference = await db.SalaryComponentDefinition.findOne({
      where: { id: percentageOfComponentId, companyId },
    });
    if (!reference) throw new HttpError(400, 'Referenced component not found for this company');
  }
  // isPfWage only makes sense for a component that's actually paid out as an
  // earning (Basic/DA) — a deduction or reimbursement can't be part of the
  // PF wage basis.
  if (isPfWage && componentCategory !== 'earning') {
    throw new HttpError(400, 'Only an earning component can count toward the PF wage basis');
  }

  try {
    return await db.SalaryComponentDefinition.create({
      companyId,
      code,
      name,
      componentCategory,
      calculationType,
      defaultValue: defaultValue || 0,
      percentageOfComponentId: calculationType === 'percentage_of_component' ? percentageOfComponentId : null,
      displayOrder: displayOrder || 0,
      isPfWage: !!isPfWage,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'code already in use for this company');
    }
    throw err;
  }
}

async function updateComponent({ companyId, id, updates }) {
  const component = await getComponentForWrite({ companyId, id });
  const { name, defaultValue, displayOrder, isActive, isPfWage } = updates;

  if (isPfWage && component.componentCategory !== 'earning') {
    throw new HttpError(400, 'Only an earning component can count toward the PF wage basis');
  }

  await component.update({
    ...(name !== undefined && { name }),
    ...(defaultValue !== undefined && { defaultValue }),
    ...(displayOrder !== undefined && { displayOrder }),
    ...(isActive !== undefined && { isActive }),
    ...(isPfWage !== undefined && { isPfWage }),
  });
  return component;
}

// "Delete" is a soft catalog disable (is_active=false), not a paranoid
// destroy — a component already used by a past structure/payslip must stay
// resolvable (payslip_components snapshots its name/category regardless,
// but employee_salary_components.definition association still needs a live
// row to eager-load from). Disabling only hides it from future assignment.
async function deactivateComponent({ companyId, id }) {
  const component = await getComponentForWrite({ companyId, id });
  await component.update({ isActive: false });
  return component;
}

module.exports = {
  listComponents,
  getComponentForWrite,
  createComponent,
  updateComponent,
  deactivateComponent,
};
