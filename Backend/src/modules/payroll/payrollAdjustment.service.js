'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function listAdjustments({ companyId, employeeId, periodMonth, periodYear, status, limit, offset }) {
  const where = { companyId };
  if (employeeId) where.employeeId = employeeId;
  if (periodMonth) where.periodMonth = periodMonth;
  if (periodYear) where.periodYear = periodYear;
  if (status) where.status = status;

  return db.PayrollAdjustment.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'DESC']],
    include: [
      { model: db.Employee, as: 'employee', attributes: ['id', 'name', 'employeeCode'] },
      { model: db.SalaryComponentDefinition, as: 'definition', attributes: ['id', 'code', 'name'] },
    ],
  });
}

async function getAdjustmentForWrite({ companyId, id }) {
  const adjustment = await db.PayrollAdjustment.findOne({ where: { id, companyId } });
  if (!adjustment) throw new HttpError(404, 'Payroll adjustment not found');
  return adjustment;
}

// A period that's already been processed/paid can no longer accept new
// adjustments — they'd never be picked up by a run again (v1 has no
// re-processing of an already-processed run).
async function assertPeriodOpen({ companyId, periodMonth, periodYear }) {
  const run = await db.PayrollRun.findOne({
    where: { companyId, periodMonth, periodYear, status: ['processed', 'paid'] },
  });
  if (run) throw new HttpError(409, 'That payroll period has already been processed');
}

async function createAdjustment({
  companyId,
  employeeId,
  periodMonth,
  periodYear,
  componentDefinitionId,
  type,
  amount,
  description,
  createdByUserId,
}) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  if (!amount || Number(amount) <= 0) throw new HttpError(400, 'amount must be a positive number');

  await assertPeriodOpen({ companyId, periodMonth, periodYear });

  return db.PayrollAdjustment.create({
    companyId,
    employeeId,
    periodMonth,
    periodYear,
    componentDefinitionId: componentDefinitionId || null,
    type,
    amount,
    description: description || null,
    createdByUserId,
  });
}

async function updateAdjustment({ companyId, id, updates }) {
  const adjustment = await getAdjustmentForWrite({ companyId, id });
  if (adjustment.status !== 'pending') {
    throw new HttpError(409, 'Only a pending adjustment can be updated');
  }
  const { amount, description } = updates;
  await adjustment.update({
    ...(amount !== undefined && { amount }),
    ...(description !== undefined && { description }),
  });
  return adjustment;
}

async function cancelAdjustment({ companyId, id }) {
  const adjustment = await getAdjustmentForWrite({ companyId, id });
  if (adjustment.status !== 'pending') {
    throw new HttpError(409, 'Only a pending adjustment can be cancelled');
  }
  await adjustment.update({ status: 'cancelled' });
  return adjustment;
}

module.exports = {
  listAdjustments,
  getAdjustmentForWrite,
  createAdjustment,
  updateAdjustment,
  cancelAdjustment,
};
