'use strict';

const db = require('../models');

// employees.manager_id is a self-referencing FK (employee.js) with no brand
// constraint of its own — a manager and their direct report can even be in
// different Brands, so this deliberately scopes by companyId only.
//
// Single-manager only — used as-is by OD's manager-approval routing
// (odRequest.routes.js/service.js), which hasn't been extended to multiple
// managers. Leave's own "reports" scope uses getManagedEmployeeIds below
// instead, which is multi-manager aware.
async function getDirectReportEmployeeIds({ companyId, managerEmployeeId }) {
  const reports = await db.Employee.findAll({
    where: { companyId, managerId: managerEmployeeId },
    attributes: ['id'],
  });
  return reports.map((report) => report.id);
}

// The full, LIVE set of an employee's managers — manager_id (the "primary"
// manager, unchanged single-select field) UNIONed with every row in
// employee_managers (any additional managers assigned via the Employee
// Detail Modal's "Additional Managers" picker). Returns plain Employee-like
// objects ({ id, name, employeeCode, userId }), primary manager first when
// present. This is the live/current set — for a specific already-submitted
// leave request, use its own SNAPSHOTTED leave_request_approvals rows
// instead (see leaveRequest.service.js), not this function, so who's
// deciding an in-flight request never shifts underneath it.
async function getManagersForEmployee({ companyId, employeeId }) {
  const employee = await db.Employee.findOne({
    where: { id: employeeId, companyId },
    attributes: ['id', 'managerId'],
  });
  if (!employee) return [];

  const links = await db.EmployeeManager.findAll({
    where: { employeeId },
    include: [{ model: db.Employee, as: 'manager', attributes: ['id', 'name', 'employeeCode', 'userId'] }],
  });
  const managers = links.map((link) => link.manager).filter(Boolean);
  const seenIds = new Set(managers.map((m) => String(m.id)));

  if (employee.managerId && !seenIds.has(String(employee.managerId))) {
    const primary = await db.Employee.findOne({
      where: { id: employee.managerId },
      attributes: ['id', 'name', 'employeeCode', 'userId'],
    });
    if (primary) managers.unshift(primary);
  }

  return managers;
}

// Multi-manager aware "my team" resolution for Leave's Team Approvals page
// (?scope=reports) — every employee who currently has managerEmployeeId as
// EITHER their primary manager_id OR one of their additional managers.
// employee_managers has no brand constraint either, same reasoning as
// getDirectReportEmployeeIds above.
async function getManagedEmployeeIds({ companyId, managerEmployeeId }) {
  const [primaryReports, additionalLinks] = await Promise.all([
    db.Employee.findAll({ where: { companyId, managerId: managerEmployeeId }, attributes: ['id'] }),
    db.EmployeeManager.findAll({ where: { companyId, managerId: managerEmployeeId }, attributes: ['employeeId'] }),
  ]);
  const ids = new Set(primaryReports.map((report) => String(report.id)));
  additionalLinks.forEach((link) => ids.add(String(link.employeeId)));
  return [...ids];
}

module.exports = { getDirectReportEmployeeIds, getManagersForEmployee, getManagedEmployeeIds };
