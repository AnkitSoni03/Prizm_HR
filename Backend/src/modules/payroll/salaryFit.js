'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const { normalizeRules, resolveCustomItems, computeSalary } = require('./payrollRules');
const { memberItemIds } = require('./customItemMembers');

// Basic + HRA + an employee's recurring allowances must fit inside their
// gross salary — otherwise Special would go negative and the month would
// pay more than the gross entered. Checked when a salary is assigned or
// corrected and when an allowance is added or changed. Allowances limited to
// some months count too (the check covers the month that has them all).

const OVERFLOW_MESSAGE = 'Basic + HRA + allowances are more than the gross salary — raise the gross, or lower the allowances or the Basic / HRA %';

const plain = (row) => (row.get ? row.get({ plain: true }) : row);

// employeeId -> the active allowance ('earning') items they were chosen for.
async function allowanceItemsOf(employeeIds) {
  const members = await memberItemIds(employeeIds);
  const itemIds = [...new Set([...members.values()].flatMap((set) => [...set]))];
  const items = itemIds.length
    ? (await db.PayrollCustomItem.findAll({ where: { id: { [Op.in]: itemIds }, kind: 'earning', isActive: true } })).map(plain)
    : [];
  const out = new Map();
  for (const [employeeId, set] of members) out.set(employeeId, items.filter((i) => set.has(String(i.id))));
  return out;
}

function overflows({ monthlyGross, rules, items }) {
  const normalized = normalizeRules(rules);
  return computeSalary({ monthlyGross, rules: normalized, customItems: resolveCustomItems(normalized, items) }).overflow;
}

// 400 when this salary wouldn't fit the employee's allowances.
async function assertSalaryFits({ employeeId, monthlyGross, rules }) {
  const items = await runAsCompany(null, async () => (await allowanceItemsOf([employeeId])).get(String(employeeId)) || []);
  if (overflows({ monthlyGross, rules, items })) throw new HttpError(400, OVERFLOW_MESSAGE);
}

// 400 naming the employees whose current salary this allowance (being
// created or changed — plain values, `id` when it exists) would push past
// their gross.
async function assertAllowanceFits(item, employeeIds) {
  if (item.kind !== 'earning' || item.isActive === false || employeeIds.length === 0) return;
  const over = await runAsCompany(null, async () => {
    const assignments = await db.SalaryAssignment.findAll({
      where: { employeeId: { [Op.in]: employeeIds.map(String) }, status: 'active' },
      include: [
        { model: db.PayrollTemplate, as: 'template', paranoid: false, attributes: ['id', 'rules'] },
        { model: db.Employee, as: 'employee', attributes: ['id', 'name'] },
      ],
    });
    const itemsBy = await allowanceItemsOf(assignments.map((a) => a.employeeId));
    return assignments
      .filter((a) => {
        const others = (itemsBy.get(String(a.employeeId)) || []).filter((i) => String(i.id) !== String(item.id));
        return overflows({ monthlyGross: Number(a.monthlyGross), rules: a.template ? a.template.rules : {}, items: [...others, item] });
      })
      .map((a) => (a.employee && a.employee.name) || `Employee ${a.employeeId}`);
  });
  if (over.length > 0) {
    throw new HttpError(
      400,
      `This allowance would be more than the gross salary allows for ${over.length} employee(s) (${over.slice(0, 3).join(', ')}${over.length > 3 ? '…' : ''}) — lower it, or raise their gross first`
    );
  }
}

module.exports = { OVERFLOW_MESSAGE, assertSalaryFits, assertAllowanceFits };
