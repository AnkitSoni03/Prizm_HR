'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { datesBetween, dateOnly } = require('../../utils/dateRange');
const { isWorkingDay } = require('../../utils/workingDays');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { notifyUser } = require('../../utils/notifications');
const { getOrCreateSettings } = require('./payrollSettings.service');
const { getOverlappingStructures } = require('./salaryStructure.service');

// If the company's pay cycle starts on the 1st (the common case), the
// period is simply the calendar month. If it starts mid-month (e.g. 26th),
// the period runs from that day of the *previous* month through the day
// before it in the target month — JS Date's month rollover handles year
// boundaries (e.g. periodMonth=1 rolling into December of the prior year)
// without special-casing.
function computePayPeriod({ periodMonth, periodYear, payCycleStartDay }) {
  if (payCycleStartDay <= 1) {
    const start = new Date(periodYear, periodMonth - 1, 1);
    const end = new Date(periodYear, periodMonth, 0);
    return { start: dateOnly(start), end: dateOnly(end) };
  }
  const start = new Date(periodYear, periodMonth - 2, payCycleStartDay);
  const end = new Date(periodYear, periodMonth - 1, payCycleStartDay - 1);
  return { start: dateOnly(start), end: dateOnly(end) };
}

async function listRuns({ companyId, limit, offset }) {
  return db.PayrollRun.findAndCountAll({
    where: { companyId },
    limit,
    offset,
    order: [['periodYear', 'DESC'], ['periodMonth', 'DESC']],
  });
}

async function getRunForRead({ companyId, id }) {
  const run = await db.PayrollRun.findOne({ where: { id, companyId } });
  if (!run) throw new HttpError(404, 'Payroll run not found');
  return run;
}

async function createDraftRun({ companyId, periodMonth, periodYear }) {
  const settings = await getOrCreateSettings(companyId);
  const { start, end } = computePayPeriod({ periodMonth, periodYear, payCycleStartDay: settings.payCycleStartDay });

  try {
    return await db.PayrollRun.create({
      companyId,
      periodMonth,
      periodYear,
      payPeriodStart: start,
      payPeriodEnd: end,
      status: 'draft',
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'A payroll run for this period already exists');
    }
    throw err;
  }
}

// A working day counts as payable if attendance shows present/on_duty (1),
// half_day (0.5), or an approved leave whose leave type is paid covers it;
// otherwise it's LOP. Segment-scoped: only dates within [segStart, segEnd]
// are considered — see processRun's segment loop for why.
async function computeSegmentPayability({ employeeId, companyId, brandId, segStart, segEnd }) {
  const dates = datesBetween(segStart, segEnd);
  let workingDays = 0;
  let payableDays = 0;

  const attendanceRows = await db.Attendance.findAll({
    where: { employeeId, date: { [Op.between]: [segStart, segEnd] } },
  });
  const attendanceByDate = new Map(attendanceRows.map((a) => [a.date, a.status]));

  const paidLeaveRows = await db.LeaveRequest.findAll({
    where: {
      employeeId,
      status: 'approved',
      fromDate: { [Op.lte]: segEnd },
      toDate: { [Op.gte]: segStart },
    },
    include: [{ model: db.LeaveType, as: 'leaveType', where: { isPaid: true } }],
  });
  const paidLeaveDates = new Set();
  for (const leave of paidLeaveRows) {
    for (const d of datesBetween(leave.fromDate, leave.toDate)) paidLeaveDates.add(d);
  }

  for (const date of dates) {
    if (!(await isWorkingDay({ employeeId, companyId, brandId, dateStr: date }))) continue;
    workingDays += 1;

    const status = attendanceByDate.get(date);
    if (status === 'present' || status === 'on_duty') payableDays += 1;
    else if (status === 'half_day') payableDays += 0.5;
    else if (paidLeaveDates.has(date)) payableDays += 1;
  }

  return { workingDays, payableDays };
}

// Working days across the WHOLE run period — the shared proration
// denominator for every segment (see processRun's function-level comment
// for why this must not be the segment's own working-day count).
async function computePeriodWorkingDays({ employeeId, companyId, brandId, periodStart, periodEnd }) {
  const dates = datesBetween(periodStart, periodEnd);
  let workingDays = 0;
  for (const date of dates) {
    if (await isWorkingDay({ employeeId, companyId, brandId, dateStr: date })) workingDays += 1;
  }
  return workingDays;
}

// Core engine. Segment-based: an employee's structures overlapping the
// period each contribute their own clipped date range, before summing into
// one payslip. Two distinct quantities matter and must not be conflated:
//
// 1. `periodWorkingDays` — working days across the WHOLE run period, the
//    same shared denominator for every segment. This is what makes a new
//    joiner's first partial month correctly come out to a FRACTION of a
//    full month's pay (e.g. present for 16 of the period's 30 working days
//    → ~53% of the monthly rate) rather than a full month's pay for a half
//    month worked — dividing by a segment's own (smaller) working-day count
//    instead would pay every partial segment as if it were a complete
//    month on its own, wildly overpaying a new joiner or a mid-period raise.
// 2. Each segment's own working/payable days — used only for the payslip's
//    displayed workingDays/lopDays (so a new joiner correctly shows zero
//    LOP for days before they even existed under this structure, which is
//    a separate concern from how much of the month's pay they've earned).
//
// Deduction/reimbursement components are flat monthly amounts, not
// prorated, and are taken from the "current" segment's structure only
// (whichever is status='active', or the most recent if none is) — summing
// a flat component like a fixed PT deduction across two segments of the
// same month would double-count it just because a raise happened to land
// mid-month.
async function processRun({ companyId, id, actorUserId }) {
  const run = await getRunForRead({ companyId, id });
  if (run.status !== 'draft') throw new HttpError(409, 'Payroll run is not in draft status');

  const employees = await db.Employee.findAll({ where: { companyId, status: 'active' } });

  const payslipNotifications = [];

  await db.sequelize.transaction(async (t) => {
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const employee of employees) {
      const structures = await getOverlappingStructures({
        companyId,
        employeeId: employee.id,
        periodStart: run.payPeriodStart,
        periodEnd: run.payPeriodEnd,
      });
      if (structures.length === 0) continue;

      const periodWorkingDays = await computePeriodWorkingDays({
        employeeId: employee.id,
        companyId,
        brandId: employee.brandId,
        periodStart: run.payPeriodStart,
        periodEnd: run.payPeriodEnd,
      });

      let workingDaysTotal = 0;
      let payableDaysTotal = 0;
      // componentDefinitionId -> { category, name, amount }; a synthetic
      // key is used for adjustments with no component_definition_id.
      const componentTotals = new Map();
      const currentStructure = structures.find((s) => s.status === 'active') || structures[structures.length - 1];

      for (const structure of structures) {
        const segStart = structure.effectiveFrom > run.payPeriodStart ? structure.effectiveFrom : run.payPeriodStart;
        const structureEnd = structure.effectiveTo || run.payPeriodEnd;
        const segEnd = structureEnd < run.payPeriodEnd ? structureEnd : run.payPeriodEnd;
        if (segStart > segEnd) continue;

        const { workingDays, payableDays } = await computeSegmentPayability({
          employeeId: employee.id,
          companyId,
          brandId: employee.brandId,
          segStart,
          segEnd,
        });
        workingDaysTotal += workingDays;
        payableDaysTotal += payableDays;
        const factor = periodWorkingDays > 0 ? payableDays / periodWorkingDays : 1;

        for (const component of structure.components) {
          const { definition } = component;
          if (definition.componentCategory !== 'earning') continue;

          const amount = Math.round(Number(component.resolvedAmount) * factor * 100) / 100;
          const key = definition.id;
          const existing = componentTotals.get(key);
          if (existing) existing.amount += amount;
          else componentTotals.set(key, { category: definition.componentCategory, name: definition.name, amount });
        }
      }

      // Flat (non-earning) components come from the current segment's
      // structure only — see the function-level comment above.
      for (const component of currentStructure.components) {
        const { definition } = component;
        if (definition.componentCategory === 'earning') continue;
        componentTotals.set(definition.id, {
          category: definition.componentCategory,
          name: definition.name,
          amount: Number(component.resolvedAmount),
        });
      }

      const pendingAdjustments = await db.PayrollAdjustment.findAll({
        where: { companyId, employeeId: employee.id, periodMonth: run.periodMonth, periodYear: run.periodYear, status: 'pending' },
        transaction: t,
      });
      for (const adjustment of pendingAdjustments) {
        const key = adjustment.componentDefinitionId || `adjustment-${adjustment.id}`;
        const category = adjustment.type === 'bonus' ? 'earning' : 'deduction';
        const name = adjustment.description || (adjustment.type === 'bonus' ? 'Bonus' : 'Deduction');
        const amount = Number(adjustment.amount);
        const existing = componentTotals.get(key);
        if (existing) existing.amount += amount;
        else componentTotals.set(key, { category, name, amount });

        await adjustment.update({ payrollRunId: run.id, status: 'applied' }, { transaction: t });
      }

      const grossEarnings = [...componentTotals.values()]
        .filter((c) => c.category === 'earning' || c.category === 'reimbursement')
        .reduce((sum, c) => sum + c.amount, 0);
      const employeeDeductions = [...componentTotals.values()]
        .filter((c) => c.category === 'deduction')
        .reduce((sum, c) => sum + c.amount, 0);
      const netPay = Math.round((grossEarnings - employeeDeductions) * 100) / 100;

      const payslip = await db.Payslip.create(
        {
          companyId,
          payrollRunId: run.id,
          employeeId: employee.id,
          salaryStructureId: currentStructure.id,
          workingDays: workingDaysTotal,
          lopDays: workingDaysTotal - payableDaysTotal,
          payableDays: payableDaysTotal,
          grossEarnings: Math.round(grossEarnings * 100) / 100,
          totalDeductions: Math.round(employeeDeductions * 100) / 100,
          netPay,
        },
        { transaction: t }
      );

      await db.PayslipComponent.bulkCreate(
        [...componentTotals.entries()].map(([key, c]) => ({
          payslipId: payslip.id,
          componentDefinitionId: typeof key === 'number' ? key : null,
          category: c.category,
          name: c.name,
          amount: Math.round(c.amount * 100) / 100,
        })),
        { transaction: t }
      );

      totalGross += grossEarnings;
      totalDeductions += employeeDeductions;
      totalNet += netPay;

      if (employee.userId) {
        payslipNotifications.push({
          userId: employee.userId,
          title: `Your payslip for ${run.periodMonth}/${run.periodYear} is ready`,
          body: `Net pay: ${netPay}`,
        });
      }
    }

    await run.update(
      {
        status: 'processed',
        processedAt: new Date(),
        processedByUserId: actorUserId,
        totalGross: Math.round(totalGross * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        totalNet: Math.round(totalNet * 100) / 100,
      },
      { transaction: t }
    );

    await recordApprovalDecision({
      companyId,
      requestType: 'payroll_run',
      requestId: run.id,
      action: 'processed',
      actorUserId,
      transaction: t,
    });
  });

  await Promise.all(
    payslipNotifications.map((n) =>
      notifyUser({ companyId, userId: n.userId, type: 'payroll_run', requestType: 'payroll_run', requestId: run.id, title: n.title, body: n.body })
    )
  );

  return getRunForRead({ companyId, id });
}

async function markPaid({ companyId, id, actorUserId }) {
  const run = await getRunForRead({ companyId, id });
  if (run.status !== 'processed') throw new HttpError(409, 'Payroll run must be processed before it can be marked paid');

  await db.sequelize.transaction(async (t) => {
    await run.update({ status: 'paid', paidAt: new Date(), paidByUserId: actorUserId }, { transaction: t });
    await recordApprovalDecision({
      companyId,
      requestType: 'payroll_run',
      requestId: run.id,
      action: 'paid',
      actorUserId,
      transaction: t,
    });
  });

  const payslips = await db.Payslip.findAll({
    where: { payrollRunId: run.id },
    include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'userId'] }],
  });
  await Promise.all(
    payslips
      .filter((p) => p.employee?.userId)
      .map((p) =>
        notifyUser({
          companyId,
          userId: p.employee.userId,
          type: 'payroll_run',
          requestType: 'payroll_run',
          requestId: run.id,
          title: `Your payslip for ${run.periodMonth}/${run.periodYear} has been paid`,
          body: `Net pay: ${p.netPay}`,
        })
      )
  );

  return run;
}

async function cancelRun({ companyId, id }) {
  const run = await getRunForRead({ companyId, id });
  if (run.status !== 'draft') throw new HttpError(409, 'Only a draft payroll run can be cancelled');

  await db.sequelize.transaction(async (t) => {
    await db.PayrollAdjustment.update(
      { payrollRunId: null, status: 'pending' },
      { where: { payrollRunId: run.id }, transaction: t }
    );
    await run.update({ status: 'cancelled' }, { transaction: t });
  });

  return run;
}

module.exports = {
  computePayPeriod,
  listRuns,
  getRunForRead,
  createDraftRun,
  processRun,
  markPaid,
  cancelRun,
};
