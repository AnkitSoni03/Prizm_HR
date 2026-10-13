'use strict';

const { HttpError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/pagination');
const { notifyUser } = require('../../utils/notifications');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const templates = require('./payrollTemplate.service');
const assignments = require('./salaryAssignment.service');
const payrolls = require('./employeePayroll.service');
const bonuses = require('./payrollBonus.service');
const { payrollManagerRecipients } = require('./payrollAccess');
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
    res.json({ data: await templates.getTemplateDefaults(req.payroll.groupId) });
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
  createCustomItem: wrap(async (req, res) => {
    res.status(201).json({ data: await templates.createCustomItem({ groupId: req.payroll.groupId, body: req.body, userId: req.auth.userId }) });
  }),
  updateCustomItem: wrap(async (req, res) => {
    res.json({ data: await templates.updateCustomItem({ groupId: req.payroll.groupId, id: req.params.id, body: req.body }) });
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

  // ---- Payslip requests (managers) ----
  listPayslipRequests: wrap(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await payrolls.listPayslipRequests(req.payroll, { ...req.query, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  }),
  decidePayslipRequest: wrap(async (req, res) => {
    const { decision, reason } = req.body;
    const request = await payrolls.decidePayslipRequest(req.payroll, { id: req.params.id, decision, reason, userId: req.auth.userId });
    const months = request.periods.map(periodLabel).join(', ');
    await recordApprovalDecision({
      companyId: request.companyId,
      requestType: 'payslip_request',
      requestId: request.id,
      action: decision,
      actorUserId: req.auth.userId,
      reason: decision === 'rejected' ? reason : null,
    }).catch((err) => console.error('Failed to record payslip decision:', err));
    if (request.employee && request.employee.userId) {
      await notifyUser({
        companyId: request.employee.companyId,
        userId: request.employee.userId,
        type: 'approval_decision',
        requestType: 'payslip_request',
        requestId: request.id,
        title: decision === 'approved' ? 'Your payslip is ready' : 'Your payslip request was rejected',
        body: decision === 'approved' ? `${months} — open My Salary to view or download it` : `${months}: ${String(reason).trim()}`,
      });
    }
    res.json({ data: request });
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
    if (!row.payslipReleased) throw new HttpError(403, 'Request this payslip first — it becomes available once approved');
    await sendPdf(res, row);
  }),
  myPayslipRequests: wrap(async (req, res) => {
    res.json({ data: await payrolls.listMyPayslipRequests(requireEmployee(req)) });
  }),
  createMyPayslipRequest: wrap(async (req, res) => {
    const { request, employee } = await payrolls.createPayslipRequest({
      employeeId: requireEmployee(req),
      periods: req.body.periods,
      note: req.body.note,
    });
    const recipients = await payrollManagerRecipients(request.groupId);
    const label = employee.name || employee.employeeCode || 'An employee';
    await Promise.all(
      recipients
        .filter((r) => String(r.userId) !== String(req.auth.userId))
        .map((r) =>
          notifyUser({
            // A Group Admin has no company — the notification is filed under
            // the employee's; the bell reads a company-less user's by user id.
            companyId: r.companyId || request.companyId,
            userId: r.userId,
            type: 'approval_pending',
            requestType: 'payslip_request',
            requestId: request.id,
            title: `${label} requested a payslip`,
            body: request.periods.map(periodLabel).join(', '),
          })
        )
    );
    res.status(201).json({ data: request });
  }),
  cancelMyPayslipRequest: wrap(async (req, res) => {
    res.json({ data: await payrolls.cancelMyPayslipRequest(requireEmployee(req), req.params.id) });
  }),
};
