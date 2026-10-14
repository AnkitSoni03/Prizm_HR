'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { runAsCompany } = require('../../config/tenant-context');

// employeeId -> Set(customItemId) of the extra items each employee was chosen
// for (payroll_custom_item_employees).
async function memberItemIds(employeeIds) {
  const ids = [...new Set(employeeIds.map(String))];
  const out = new Map(ids.map((id) => [id, new Set()]));
  if (ids.length === 0) return out;
  const rows = await runAsCompany(null, () =>
    db.PayrollCustomItemEmployee.findAll({
      where: { employeeId: { [Op.in]: ids } },
      attributes: ['employeeId', 'customItemId'],
      raw: true,
    })
  );
  for (const r of rows) {
    const set = out.get(String(r.employeeId));
    if (set) set.add(String(r.customItemId));
  }
  return out;
}

module.exports = { memberItemIds };
