'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { addDays } = require('../../utils/dateRange');
const { assertEmployeeInBrandScope } = require('../../utils/brandScope');

const DEFINITION_INCLUDE = { model: db.SalaryComponentDefinition, as: 'definition' };
const COMPONENTS_INCLUDE = { model: db.EmployeeSalaryComponent, as: 'components', include: [DEFINITION_INCLUDE] };

// Resolves resolved_amount for every line in `lines` (each {definition,
// value}), honoring arbitrary-depth percentage_of_component chains (e.g. a
// component that's a percentage of HRA, which is itself a percentage of
// BASIC). Nothing about chain depth is limited by the schema — the only
// constraints are: every percentage reference must resolve against a
// sibling included in this same structure, and the chain must not cycle.
// Uses Kahn's algorithm so cycles surface as "couldn't fully sort" rather
// than an infinite loop.
function resolveComponentAmounts(lines) {
  const byDefinitionId = new Map(lines.map((line) => [line.definition.id, line]));

  // dependents[X] = components that depend on X resolving first.
  const dependents = new Map();
  const inDegree = new Map();
  for (const line of lines) {
    inDegree.set(line.definition.id, 0);
    dependents.set(line.definition.id, []);
  }
  for (const line of lines) {
    if (line.definition.calculationType !== 'percentage_of_component') continue;
    const refId = line.definition.percentageOfComponentId;
    if (!refId || !byDefinitionId.has(refId)) {
      throw new HttpError(
        400,
        `"${line.definition.name}" is a percentage of a component that isn't included in this structure`
      );
    }
    dependents.get(refId).push(line.definition.id);
    inDegree.set(line.definition.id, inDegree.get(line.definition.id) + 1);
  }

  const queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);
  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const dependentId of dependents.get(id)) {
      inDegree.set(dependentId, inDegree.get(dependentId) - 1);
      if (inDegree.get(dependentId) === 0) queue.push(dependentId);
    }
  }

  if (order.length !== lines.length) {
    throw new HttpError(400, 'Circular percentage-of-component reference detected in this structure');
  }

  const resolvedAmountById = new Map();
  for (const id of order) {
    const line = byDefinitionId.get(id);
    let resolvedAmount;
    if (line.definition.calculationType === 'fixed_amount') {
      resolvedAmount = Number(line.value);
    } else {
      const refAmount = resolvedAmountById.get(line.definition.percentageOfComponentId);
      resolvedAmount = Math.round(((Number(line.value) / 100) * refAmount) * 100) / 100;
    }
    resolvedAmountById.set(id, resolvedAmount);
    line.resolvedAmount = resolvedAmount;
  }

  return lines;
}

async function getActiveStructure({ companyId, employeeId, scopedBrandIds }) {
  await assertEmployeeInBrandScope({ employeeId, companyId, scopedBrandIds });
  return db.EmployeeSalaryStructure.findOne({
    where: { companyId, employeeId, status: 'active' },
    include: [COMPONENTS_INCLUDE],
  });
}

async function getStructureForRead({ companyId, id, scopedBrandIds, transaction }) {
  const structure = await db.EmployeeSalaryStructure.findOne({
    where: { id, companyId },
    include: [COMPONENTS_INCLUDE],
    transaction,
  });
  if (!structure) throw new HttpError(404, 'Salary structure not found');
  await assertEmployeeInBrandScope({ employeeId: structure.employeeId, companyId, scopedBrandIds });
  return structure;
}

async function listStructuresForEmployee({ companyId, employeeId, scopedBrandIds }) {
  await assertEmployeeInBrandScope({ employeeId, companyId, scopedBrandIds });
  return db.EmployeeSalaryStructure.findAll({
    where: { companyId, employeeId },
    order: [['effectiveFrom', 'DESC']],
    include: [COMPONENTS_INCLUDE],
  });
}

// Every EmployeeSalaryStructure row (active or superseded) whose date range
// overlaps [periodStart, periodEnd] — normally exactly one, two only when a
// structure change happened mid-period. Used by payrollRun.service.js's
// segment-based proration.
async function getOverlappingStructures({ companyId, employeeId, periodStart, periodEnd }) {
  return db.EmployeeSalaryStructure.findAll({
    where: {
      companyId,
      employeeId,
      effectiveFrom: { [Op.lte]: periodEnd },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: periodStart } }],
    },
    include: [COMPONENTS_INCLUDE],
    order: [['effectiveFrom', 'ASC']],
  });
}

// Assigns a new versioned structure to an employee — never mutates an
// existing one in place. If an active structure already exists, it's
// superseded (effective_to set to the day before the new one starts,
// status flipped) rather than deleted, so historical payslips generated
// against it remain traceable and unaffected.
async function assignSalaryStructure({
  companyId,
  employeeId,
  effectiveFrom,
  annualCtc,
  components,
  createdByUserId,
  scopedBrandIds,
}) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (scopedBrandIds && !scopedBrandIds.some((brandId) => String(brandId) === String(employee.brandId))) {
    throw new HttpError(404, 'Employee not found');
  }

  if (!Array.isArray(components) || components.length === 0) {
    throw new HttpError(400, 'At least one salary component is required');
  }

  const definitionIds = components.map((c) => c.componentDefinitionId);
  const definitions = await db.SalaryComponentDefinition.findAll({
    where: { id: { [Op.in]: definitionIds }, companyId, isActive: true },
  });
  const definitionById = new Map(definitions.map((d) => [d.id, d]));

  const lines = components.map((c) => {
    const definition = definitionById.get(c.componentDefinitionId);
    if (!definition) {
      throw new HttpError(400, `Component definition ${c.componentDefinitionId} not found or inactive`);
    }
    if (definition.calculationType === 'formula') {
      throw new HttpError(400, `"${definition.name}" is a formula component and is not yet supported`);
    }
    const value = c.value !== undefined && c.value !== null ? c.value : definition.defaultValue;
    return { definition, value };
  });

  resolveComponentAmounts(lines);

  return db.sequelize.transaction(async (t) => {
    const existingActive = await db.EmployeeSalaryStructure.findOne({
      where: { companyId, employeeId, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (existingActive) {
      if (effectiveFrom <= existingActive.effectiveFrom) {
        throw new HttpError(400, 'effectiveFrom must be after the current structure\'s effectiveFrom');
      }
      await existingActive.update(
        { status: 'superseded', effectiveTo: addDays(effectiveFrom, -1) },
        { transaction: t }
      );
    }

    const structure = await db.EmployeeSalaryStructure.create(
      { companyId, employeeId, effectiveFrom, effectiveTo: null, annualCtc, status: 'active', createdByUserId },
      { transaction: t }
    );

    await db.EmployeeSalaryComponent.bulkCreate(
      lines.map((line) => ({
        companyId,
        salaryStructureId: structure.id,
        componentDefinitionId: line.definition.id,
        calculationType: line.definition.calculationType,
        value: line.value,
        resolvedAmount: line.resolvedAmount,
      })),
      { transaction: t }
    );

    return getStructureForRead({ companyId, id: structure.id, transaction: t });
  });
}

module.exports = {
  resolveComponentAmounts,
  getActiveStructure,
  getStructureForRead,
  listStructuresForEmployee,
  getOverlappingStructures,
  assignSalaryStructure,
};
