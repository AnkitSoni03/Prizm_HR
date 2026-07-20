'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function assertBelongsToCompany(model, id, companyId, label) {
  const row = await model.findOne({ where: { id, companyId } });
  if (!row) throw new HttpError(400, `${label} not found for this company`);
}

// employee_shifts has no company_id column of its own — tenant isolation
// goes through the parent employee, same as employee_documents.
async function assertEmployeeInCompany({ companyId, employeeId }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  return employee;
}

async function listEmployeeShifts({ companyId, employeeId }) {
  await assertEmployeeInCompany({ companyId, employeeId });
  return db.EmployeeShift.findAll({
    where: { employeeId },
    order: [['effectiveFrom', 'DESC']],
  });
}

// The active default shift as of `date` (defaults to today): the row with
// the latest effective_from <= date. Exported for the check-in flow to fall
// back to when no shift_rosters entry exists for that date.
async function getActiveEmployeeShift({ employeeId, date }) {
  return db.EmployeeShift.findOne({
    where: { employeeId, effectiveFrom: { [Op.lte]: date } },
    order: [['effectiveFrom', 'DESC']],
    include: [{ model: db.Shift, as: 'shift' }],
  });
}

async function createEmployeeShift({ companyId, employeeId, shiftId, effectiveFrom }) {
  await assertEmployeeInCompany({ companyId, employeeId });
  await assertBelongsToCompany(db.Shift, shiftId, companyId, 'Shift');

  return db.EmployeeShift.create({ employeeId, shiftId, effectiveFrom });
}

async function deleteEmployeeShift({ companyId, employeeId, id }) {
  await assertEmployeeInCompany({ companyId, employeeId });
  const assignment = await db.EmployeeShift.findOne({ where: { id, employeeId } });
  if (!assignment) throw new HttpError(404, 'Employee shift assignment not found');
  await assignment.destroy();
}

module.exports = {
  listEmployeeShifts,
  getActiveEmployeeShift,
  createEmployeeShift,
  deleteEmployeeShift,
};
