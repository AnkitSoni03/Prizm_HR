'use strict';

const db = require('../models');

// employees.manager_id is a self-referencing FK (employee.js) with no brand
// constraint of its own — a manager and their direct report can even be in
// different Brands, so this deliberately scopes by companyId only.
async function getDirectReportEmployeeIds({ companyId, managerEmployeeId }) {
  const reports = await db.Employee.findAll({
    where: { companyId, managerId: managerEmployeeId },
    attributes: ['id'],
  });
  return reports.map((report) => report.id);
}

module.exports = { getDirectReportEmployeeIds };
