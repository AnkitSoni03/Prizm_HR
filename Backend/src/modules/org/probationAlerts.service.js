'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { runAsCompany } = require('../../config/tenant-context');
const { getBrandScope } = require('../../middleware/rbac.middleware');
const { getManagedEmployeeIds } = require('../../utils/managerScope');
const { PERIOD_EMPLOYMENT_TYPES, probationAlertFor } = require('../../utils/probation');

const ATTRIBUTES = [
  'id',
  'name',
  'employeeCode',
  'companyId',
  'brandId',
  'employmentType',
  'dateOfJoining',
  'probationPeriodDays',
];

const BASE_WHERE = {
  isActive: true,
  employmentType: { [Op.in]: PERIOD_EMPLOYMENT_TYPES },
  probationPeriodDays: { [Op.not]: null },
  dateOfJoining: { [Op.not]: null },
};

const INCLUDE = [
  { model: db.Company, as: 'company', attributes: ['id', 'name'] },
  { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
];

// Everything the login pop-up should show this caller — the same people the
// daily reminder (jobs/probationReminder.job.js) notifies, seen from their
// side:
//   - 'self'  — their own period, if it's ending/ended;
//   - 'admin' — employees they can edit (employee:update, company-wide or
//               their Brand(s)), i.e. who can change the Employment Type;
//   - 'team'  — employees they manage (primary or additional manager), in
//               any company of their Group.
// An employee reachable more than one way is listed once (self > admin >
// team). Sorted soonest/most overdue first.
async function listProbationAlerts(auth) {
  const found = new Map();
  const add = (employees, relation) => {
    for (const employee of employees) {
      const key = String(employee.id);
      if (found.has(key)) continue;
      const alert = probationAlertFor(employee);
      if (!alert) continue;
      found.set(key, {
        employeeId: employee.id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        employmentType: employee.employmentType,
        dateOfJoining: employee.dateOfJoining,
        probationPeriodDays: employee.probationPeriodDays,
        endDate: alert.endDate,
        daysRemaining: alert.daysRemaining,
        companyName: employee.company?.name ?? null,
        brandName: employee.brand?.name ?? null,
        relation,
      });
    }
  };

  if (auth.employeeId) {
    const self = await db.Employee.findAll({
      where: { ...BASE_WHERE, id: auth.employeeId },
      attributes: ATTRIBUTES,
      include: INCLUDE,
    });
    add(self, 'self');
  }

  if (auth.companyId) {
    const scope = await getBrandScope(auth, 'employee:update');
    if (scope.allowed) {
      const where = { ...BASE_WHERE, companyId: auth.companyId };
      if (!scope.companyWide) where.brandId = { [Op.in]: scope.brandIds };
      add(await db.Employee.findAll({ where, attributes: ATTRIBUTES, include: INCLUDE }), 'admin');
    }
  }

  if (auth.employeeId && auth.companyId) {
    const ids = await getManagedEmployeeIds({ companyId: auth.companyId, managerEmployeeId: auth.employeeId });
    if (ids.length > 0) {
      // Reports may sit in a sibling company of the Group — the id list
      // (already Group-bounded) is the scope, not the tenant hook.
      const team = await runAsCompany(null, () =>
        db.Employee.findAll({
          where: { ...BASE_WHERE, id: { [Op.in]: ids } },
          attributes: ATTRIBUTES,
          include: INCLUDE,
        })
      );
      add(team, 'team');
    }
  }

  return [...found.values()].sort((a, b) => a.daysRemaining - b.daysRemaining);
}

module.exports = { listProbationAlerts };
