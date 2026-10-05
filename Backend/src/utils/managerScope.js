'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { HttpError } = require('./errors');
const { runAsCompany } = require('../config/tenant-context');

// Managers may sit in ANY company of the employee's own Group (a Brand-ABC
// employee can be managed by someone in Company XYZ) — never outside it.
// employees.manager_id / employee_managers carry no brand or company
// constraint of their own; the Group boundary is enforced here, at
// assignment time (assertManagersInGroup) and again on every read
// (getManagedEmployeeIds), so a manager link can never reach across Groups.
//
// Employee is tenant-scoped (models/hooks/tenant-scope.js), which would pin
// every Employee lookup to the CALLER's company and silently hide a manager
// or report in a sibling company — so the Employee queries below run with
// the hook off and pin company_id themselves.
const unscoped = (fn) => runAsCompany(null, fn);

// Every company in `companyId`'s Group (just itself when it has no Group).
async function getGroupCompanyIds(companyId) {
  if (!companyId) return [];
  const company = await db.Company.findByPk(companyId, { attributes: ['id', 'groupId'] });
  if (!company) return [];
  if (!company.groupId) return [String(company.id)];
  const companies = await db.Company.findAll({ where: { groupId: company.groupId }, attributes: ['id'] });
  return companies.map((c) => String(c.id));
}

// 400s unless every managerId is an employee of a company in
// employeeCompanyId's Group.
async function assertManagersInGroup({ employeeCompanyId, managerIds }) {
  const ids = [...new Set((managerIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return;
  const companyIds = await getGroupCompanyIds(employeeCompanyId);
  const found = await unscoped(() =>
    db.Employee.findAll({
      where: { id: { [Op.in]: ids }, companyId: { [Op.in]: companyIds } },
      attributes: ['id'],
    })
  );
  if (found.length !== ids.length) {
    throw new HttpError(400, 'Manager not found in this group');
  }
}

const MANAGER_ATTRIBUTES = ['id', 'name', 'employeeCode', 'userId', 'companyId', 'brandId'];

// The full, LIVE set of an employee's managers — manager_id (the "primary"
// manager) UNIONed with every row in employee_managers (any additional
// managers). Managers may belong to another company of the same Group.
// Returns plain Employee-like objects ({ id, name, employeeCode, userId,
// companyId, brandId }), primary manager first when present. This is the
// live/current set — for a specific already-submitted request, use its own
// SNAPSHOTTED approval rows instead (leave_request_approvals,
// od_request_approvals, comp_off_credit_approvals), not this function, so
// who's deciding an in-flight request never shifts underneath it.
async function getManagersForEmployee({ companyId, employeeId }) {
  return unscoped(async () => {
    const employee = await db.Employee.findOne({
      where: { id: employeeId, companyId },
      attributes: ['id', 'managerId'],
    });
    if (!employee) return [];

    const links = await db.EmployeeManager.findAll({
      where: { employeeId },
      include: [{ model: db.Employee, as: 'manager', attributes: MANAGER_ATTRIBUTES }],
    });
    const managers = links.map((link) => link.manager).filter(Boolean);
    const seenIds = new Set(managers.map((m) => String(m.id)));

    if (employee.managerId && !seenIds.has(String(employee.managerId))) {
      const primary = await db.Employee.findOne({
        where: { id: employee.managerId },
        attributes: MANAGER_ATTRIBUTES,
      });
      if (primary) managers.unshift(primary);
    }

    return managers;
  });
}

// Multi-manager aware "my team" resolution for Team Approvals
// (?scope=reports on leave/OD/comp-off) — every employee, in any company of
// the caller's Group, who currently has managerEmployeeId as EITHER their
// primary manager_id OR one of their additional managers. `companyId` is the
// caller's own company (only used to find the Group).
async function getManagedEmployeeIds({ companyId, managerEmployeeId }) {
  const companyIds = await getGroupCompanyIds(companyId);
  if (companyIds.length === 0) return [];
  const [primaryReports, additionalLinks] = await unscoped(() =>
    Promise.all([
      db.Employee.findAll({
        where: { companyId: { [Op.in]: companyIds }, managerId: managerEmployeeId },
        attributes: ['id'],
      }),
      db.EmployeeManager.findAll({
        where: { companyId: { [Op.in]: companyIds }, managerId: managerEmployeeId },
        attributes: ['employeeId'],
      }),
    ])
  );
  const ids = new Set(primaryReports.map((report) => String(report.id)));
  additionalLinks.forEach((link) => ids.add(String(link.employeeId)));
  return [...ids];
}

module.exports = {
  getGroupCompanyIds,
  assertManagersInGroup,
  getManagersForEmployee,
  getManagedEmployeeIds,
};
