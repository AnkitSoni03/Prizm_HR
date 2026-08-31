'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { assertEmployeeInBrandScope, resolveScopedEmployeeIds } = require('../../utils/brandScope');

const COMPONENTS_INCLUDE = { model: db.PayslipComponent, as: 'components' };

// A PayrollRun itself is company-wide (one batch covers every brand's
// employees), so a Brand Admin still sees that a run exists via
// payrollRun.service.js — but the payslip line items *within* it are
// filtered to their own brand's employees, same as every other
// employee-scoped list in this module.
async function listPayslipsForRun({ companyId, payrollRunId, limit, offset, scopedBrandIds }) {
  const where = { companyId, payrollRunId };
  if (scopedBrandIds) {
    where.employeeId = await resolveScopedEmployeeIds({ companyId, scopedBrandIds });
  }
  return db.Payslip.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
    include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'name', 'employeeCode'] }],
  });
}

async function getPayslipForRead({ companyId, id, scopedBrandIds }) {
  const payslip = await db.Payslip.findOne({
    where: { id, companyId },
    include: [
      { model: db.Employee, as: 'employee', attributes: ['id', 'name', 'employeeCode'] },
      { model: db.PayrollRun, as: 'payrollRun', attributes: ['id', 'periodMonth', 'periodYear', 'status'] },
      COMPONENTS_INCLUDE,
    ],
  });
  if (!payslip) throw new HttpError(404, 'Payslip not found');
  await assertEmployeeInBrandScope({ employeeId: payslip.employeeId, companyId, scopedBrandIds });
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

// Used only by the PDF export path — eager-loads Company + Employee's
// department/designation that the lean JSON loaders above don't need.
// employeeId is set for the ESS own-path, omitted for the admin path.
async function loadPayslipForPdf({ companyId, employeeId, id, scopedBrandIds }) {
  const where = { id, companyId };
  if (employeeId != null) where.employeeId = employeeId;

  const payslip = await db.Payslip.findOne({
    where,
    include: [
      { model: db.Company, as: 'company', attributes: ['id', 'name', 'legalName', 'gstNumber'] },
      {
        model: db.Employee,
        as: 'employee',
        attributes: ['id', 'name', 'employeeCode'],
        include: [
          { model: db.Department, as: 'department', attributes: ['id', 'name'] },
          { model: db.Designation, as: 'designation', attributes: ['id', 'title'] },
        ],
      },
      { model: db.PayrollRun, as: 'payrollRun', attributes: ['id', 'periodMonth', 'periodYear', 'status'] },
      COMPONENTS_INCLUDE,
    ],
  });
  if (!payslip) throw new HttpError(404, 'Payslip not found');
  // employeeId is only set on the ESS own-payslip path, which is already
  // scoped to the caller's own employee — brand scope only matters for the
  // admin path (employeeId omitted).
  if (employeeId == null) {
    await assertEmployeeInBrandScope({ employeeId: payslip.employeeId, companyId, scopedBrandIds });
  }
  return payslip;
}

module.exports = { listPayslipsForRun, getPayslipForRead, listOwnPayslips, getOwnPayslip, loadPayslipForPdf };
