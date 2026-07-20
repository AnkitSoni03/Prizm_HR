'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

const COMPONENTS_INCLUDE = { model: db.PayslipComponent, as: 'components' };

async function listPayslipsForRun({ companyId, payrollRunId, limit, offset }) {
  return db.Payslip.findAndCountAll({
    where: { companyId, payrollRunId },
    limit,
    offset,
    order: [['id', 'ASC']],
    include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'name', 'employeeCode'] }],
  });
}

async function getPayslipForRead({ companyId, id }) {
  const payslip = await db.Payslip.findOne({
    where: { id, companyId },
    include: [
      { model: db.Employee, as: 'employee', attributes: ['id', 'name', 'employeeCode'] },
      { model: db.PayrollRun, as: 'payrollRun', attributes: ['id', 'periodMonth', 'periodYear', 'status'] },
      COMPONENTS_INCLUDE,
    ],
  });
  if (!payslip) throw new HttpError(404, 'Payslip not found');
  return payslip;
}

async function listOwnPayslips({ companyId, employeeId, limit, offset }) {
  return db.Payslip.findAndCountAll({
    where: { companyId, employeeId },
    limit,
    offset,
    order: [['id', 'DESC']],
    include: [{ model: db.PayrollRun, as: 'payrollRun', attributes: ['id', 'periodMonth', 'periodYear', 'status'] }],
  });
}

async function getOwnPayslip({ companyId, employeeId, id }) {
  const payslip = await db.Payslip.findOne({
    where: { id, companyId, employeeId },
    include: [
      { model: db.PayrollRun, as: 'payrollRun', attributes: ['id', 'periodMonth', 'periodYear', 'status'] },
      COMPONENTS_INCLUDE,
    ],
  });
  if (!payslip) throw new HttpError(404, 'Payslip not found');
  return payslip;
}

module.exports = { listPayslipsForRun, getPayslipForRead, listOwnPayslips, getOwnPayslip };
