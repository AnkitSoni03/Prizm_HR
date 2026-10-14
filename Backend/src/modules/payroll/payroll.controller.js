'use strict';

const { HttpError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/pagination');
const { notifyUser } = require('../../utils/notifications');
const templates = require('./payrollTemplate.service');
const assignments = require('./salaryAssignment.service');
const payrolls = require('./employeePayroll.service');
const bonuses = require('./payrollBonus.service');
const { buildPayslipPdfBuffer } = require('./payslipPdf.service');
const { BUILT_IN_ITEMS, BONUS_TYPES } = require('./payrollRules');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const periodLabel = (p) => `${MONTH_NAMES[p.month - 1]} ${p.year}`;

function wrap(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}

function requireEmployee(req) {
  if (!req.auth.employeeId) throw new HttpError(403, 'Only employees have a salary of their own');
  return req.auth.employeeId;
}

async function sendPdf(res, payroll) {
  const buffer = await buildPayslipPdfBuffer(payroll);
  const name = (payroll.employee && (payroll.employee.employeeCode || payroll.employee.name)) || 'employee';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="payslip-${String(name).replace(/[^\w-]+/g, '_')}-${payroll.periodYear}-${String(payroll.periodMonth).padStart(2, '0')}.pdf"`
  );
  res.send(buffer);
}

module.exports = {
  // ---- Access / scope ----
  access: wrap(async (req, res) => {
    res.json({ data: { canManage: req.payroll.canManage, groupId: req.payroll.groupId, companyId: req.payroll.companyId } });
  }),
  companies: wrap(async (req, res) => {
    res.json({ data: await assignments.listScopeCompanies(req.payroll) });
  }),

  // ---- Templates ----
  listTemplates: wrap(async (req, res) => {
    res.json({ data: await templates.listTemplates(req.payroll.groupId) });
  }),
  templateDefaults: wrap(async (req, res) => {
    res.json({ data: await templates.getTemplateDefaults() });
  }),
  createTemplate: wrap(async (req, res) => {
    res.status(201).json({ data: await templates.createTemplate({ groupId: req.payroll.groupId, body: req.body, userId: req.auth.userId }) });
  }),
  updateTemplate: wrap(async (req, res) => {
    res.json({ data: await templates.updateTemplate({ groupId: req.payroll.groupId, id: req.params.id, body: req.body, userId: req.auth.userId }) });
  }),
  deleteTemplate: wrap(async (req, res) => {
    await templates.deleteTemplate({ groupId: req.payroll.groupId, id: req.params.id });
    res.status(204).end();
  }),
  preview: wrap(async (req, res) => {
    res.json({ data: await templates.previewSalary({ groupId: req.payroll.groupId, body: req.body }) });
  }),

  // ---- Custom deductions ----
  listCustomItems: wrap(async (req, res) => {
    res.json({ data: await templates.listCustomItems(req.payroll.groupId), builtInItems: BUILT_IN_ITEMS });
  }),
  customItemEmployees: wrap(async (req, res) => {
    res.json({ data: await templates.listCustomItemEmployees({ groupId: req.payroll.groupId, id: req.params.id }) });
  }),
  createCustomItem: wrap(async (req, res) => {
    res.status(201).json({ data: await templates.createCustomItem({ groupId: req.payroll.groupId, body: req.body, userId: req.auth.userId }) });
  }),
  updateCustomItem: wrap(async (req, res) => {
    res.json({ data: await templates.updateCustomItem({ groupId: req.payroll.groupId, id: req.params.id, body: req.body, userId: req.auth.userId }) });
  }),
  deleteCustomItem: wrap(async (req, res) => {
    await templates.deleteCustomItem({ groupId: req.payroll.groupId, id: req.params.id });
    res.status(204).end();
  }),

  // ---- One-time bonuses / extra pay ----
  listBonuses: wrap(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count, total } = await bonuses.listBonuses(req.payroll, { ...req.query, limit, offset });
    res.json({ data: rows, total, types: BONUS_TYPES, pagination: { total: count, limit, offset } });
  }),
  createBonus: wrap(async (req, res) => {
    const { created, skipped } = await bonuses.createBonuses(req.payroll, { body: req.body, userId: req.auth.userId });
    res.status(201).json({ data: created, skipped });
  }),
  updateBonus: wrap(async (req, res) => {
    res.json({ data: await bonuses.updateBonus(req.payroll, { id: req.params.id, body: req.body, userId: req.auth.userId }) });
  }),
  deleteBonus: wrap(async (req, res) => {
    await bonuses.deleteBonus(req.payroll, { id: req.params.id });
    res.status(204).end();
  }),

  // ---- Salary assignments ----
  groupEmployees: wrap(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await assignments.listGroupEmployees(req.payroll, { ...req.query, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  }),
  listAssignments: wrap(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await assignments.listAssignments(req.payroll, { ...req.query, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  }),
  employeeHistory: wrap(async (req, res) => {
    res.json({ data: await assignments.listEmployeeHistory(req.payroll, req.params.employeeId) });
  }),
  assign: wrap(async (req, res) => {
    res.status(201).json({ data: await assignments.assignSalary(req.payroll, { body: req.body, userId: req.auth.userId }) });
  }),
  bulkAssign: wrap(async (req, res) => {
    const { created, skipped } = await assignments.bulkAssignSalary(req.payroll, { body: req.body, userId: req.auth.userId });
    res.status(201).json({ data: created, skipped });
  }),
  updateAssignment: wrap(async (req, res) => {
    res.json({ data: await assignments.updateAssignment(req.payroll, { id: req.params.id, body: req.body, userId: req.auth.userId }) });
  }),
  endAssignment: wrap(async (req, res) => {
    res.json({ data: await assignments.endAssignment(req.payroll, { id: req.params.id, endDate: req.body.endDate, userId: req.auth.userId }) });
  }),

  // ---- Monthly payroll ----
  listPayrolls: wrap(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count, totals } = await payrolls.listPayrolls(req.payroll, { ...req.query, limit, offset });
    res.json({ data: rows, totals, pagination: { total: count, limit, offset } });
  }),
  getPayroll: wrap(async (req, res) => {
    res.json({ data: await payrolls.getPayroll(req.payroll, req.params.id) });
  }),
  payrollPdf: wrap(async (req, res) => {
    await sendPdf(res, await payrolls.getPayroll(req.payroll, req.params.id));
  }),
  recalculate: wrap(async (req, res) => {
    res.json({ data: await payrolls.recalculateOne(req.payroll, req.params.id) });
  }),
  generate: wrap(async (req, res) => {
    res.json({ data: await payrolls.generateMonth(req.payroll, req.body) });
  }),

  // ---- Sharing with employees ----
  share: wrap(async (req, res) => {
    const share = req.body.share !== false;
    const rows = await payrolls.sharePayrolls(req.payroll, { ...req.body, share });
    if (share) {
      await Promise.all(
        rows
          .filter((r) => r.employee && r.employee.userId)
          .map((r) =>
            notifyUser({
              companyId: r.employee.companyId,
              userId: r.employee.userId,
              type: 'payroll_generated',
              requestType: 'payroll',
              requestId: r.id,
              title: `Your ${periodLabel({ year: r.periodYear, month: r.periodMonth })} payslip is ready`,
              body: `In-hand ₹${Number(r.netPay).toLocaleString('en-IN')} — open My Salary to view or download it`,
            }).catch((err) => console.error('Failed to notify payslip share:', err))
          )
      );
    }
    res.json({ data: { updated: rows.length } });
  }),

  // ---- Employee's own ----
  mySalary: wrap(async (req, res) => {
    const employeeId = requireEmployee(req);
    const assignment = await assignments.getMySalary(employeeId);
    const rows = await payrolls.listMyPayrolls(employeeId);
    res.json({
      data: {
        current: assignment
          ? {
            monthlyCtc: Number(assignment.monthlyCtc),
            ctcPeriod: assignment.ctcPeriod,
            ctcAmount: Number(assignment.ctcAmount),
            effectiveFrom: assignment.effectiveFrom,
            deductionsEnabled: assignment.deductionsEnabled,
          }
          : null,
        months: rows,
      },
    });
  }),
  myPayroll: wrap(async (req, res) => {
    const row = await payrolls.getMyPayroll(requireEmployee(req), req.params.id);
    res.json({ data: payrolls.toEmployeeView(row) });
  }),
  myPayrollPdf: wrap(async (req, res) => {
    const row = await payrolls.getMyPayroll(requireEmployee(req), req.params.id);
    await sendPdf(res, row);
  }),
};
