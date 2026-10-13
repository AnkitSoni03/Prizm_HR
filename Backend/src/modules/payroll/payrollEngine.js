'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { runAsCompany } = require('../../config/tenant-context');
const { datesBetween, dateOnly } = require('../../utils/dateRange');
const { isWorkingDay } = require('../../utils/workingDays');
const { getFinancialYearStart, getRemainingMonthsInFY } = require('../../utils/financialYear');
const { notifyUser } = require('../../utils/notifications');
const { normalizeRules, resolveCustomItems, computeSalary } = require('./payrollRules');

// ---------------------------------------------------------------------------
// Monthly payroll engine. Everything here runs with the tenant hook off
// (runAsCompany(null, …)) — it's called from the cron, from group-level
// managers working across companies, and from leave/attendance writes in
// whatever company they happen to run in; every query filters explicitly.
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const monthLabel = (year, month) => `${MONTH_NAMES[month - 1]} ${year}`;
const monthKey = (year, month) => year * 12 + month;

function monthBounds(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}`, days: lastDay };
}

// A month is payable only once it's over — on 13 Oct, October is not.
function isMonthComplete(year, month, today = dateOnly(new Date())) {
  return monthBounds(year, month).end < today;
}

function previousMonth(today = dateOnly(new Date())) {
  const [y, m] = today.split('-').map(Number);
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

// Every { year, month } touching [fromDate, toDate].
function monthsBetween(fromDate, toDate) {
  const [fy, fm] = fromDate.split('-').map(Number);
  const [ty, tm] = toDate.split('-').map(Number);
  const out = [];
  for (let k = monthKey(fy, fm); k <= monthKey(ty, tm); k += 1) {
    const year = Math.floor((k - 1) / 12);
    out.push({ year, month: k - year * 12 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Day classification. Paid: present / on-duty / half-day (all count as
// present), paid leave, holidays and week-offs, a sandwiched day charged to
// the leave balance. Unpaid (LOP): unpaid leave (a half-day one = 0.5), a
// sandwiched day with no balance left, a working day with no attendance and
// no leave (absent), and days before joining / after leaving / outside any
// salary assignment.
// ---------------------------------------------------------------------------
const PRESENT_STATUSES = new Set(['present', 'on_duty', 'half_day']);

async function classifyDays({ employee, start, end, segments }) {
  const dates = datesBetween(start, end);
  const [attendanceRows, leaveRows, odRows, sandwichRows] = await Promise.all([
    db.Attendance.findAll({ where: { employeeId: employee.id, date: { [Op.between]: [start, end] } }, attributes: ['date', 'status'] }),
    db.LeaveRequest.findAll({
      where: { employeeId: employee.id, status: 'approved', fromDate: { [Op.lte]: end }, toDate: { [Op.gte]: start } },
      include: [{ model: db.LeaveType, as: 'leaveType', attributes: ['id', 'isPaid', 'name'] }],
    }),
    db.OdRequest.findAll({
      where: { employeeId: employee.id, status: 'approved', fromDate: { [Op.lte]: end }, toDate: { [Op.gte]: start } },
      attributes: ['fromDate', 'toDate'],
    }),
    db.LeaveSandwichDay.findAll({ where: { employeeId: employee.id, date: { [Op.between]: [start, end] } } }),
  ]);
  const statusByDate = new Map(attendanceRows.map((a) => [a.date, a.status]));
  const sandwichByDate = new Map(sandwichRows.map((s) => [s.date, s]));
  const odDates = new Set(odRows.flatMap((od) => datesBetween(od.fromDate, od.toDate)));
  const fullLeaveByDate = new Map();
  const halfLeaveByDate = new Map(); // date -> { leave, paid }
  for (const leave of leaveRows) {
    const paid = !!(leave.leaveType && leave.leaveType.isPaid);
    if (leave.halfDaySession) {
      const entry = halfLeaveByDate.get(leave.fromDate) || { leave: 0, paid: 0 };
      entry.leave += 0.5;
      if (paid) entry.paid += 0.5;
      halfLeaveByDate.set(leave.fromDate, entry);
    } else {
      for (const d of datesBetween(leave.fromDate, leave.toDate)) fullLeaveByDate.set(d, paid);
    }
  }

  const counts = {
    present: 0, paidLeave: 0, holidayWeekoff: 0, sandwichPaid: 0,
    unpaidLeave: 0, sandwichUnpaid: 0, absent: 0, notEmployed: 0,
  };
  const lopDates = [];
  const paidBySegment = new Map(segments.map((s) => [s.id, 0]));
  let paidDays = 0;

  for (const date of dates) {
    const segment = segments.find((s) => s.from <= date && date <= s.to);
    let paid = 0;
    let reason = null;

    if (!segment) {
      counts.notEmployed += 1;
      reason = 'Not on payroll';
    } else {
      const status = statusByDate.get(date);
      const half = halfLeaveByDate.get(date);
      const sandwich = sandwichByDate.get(date);
      if (sandwich) {
        if (sandwich.isLop) { counts.sandwichUnpaid += 1; reason = 'Sandwich (no leave balance)'; } else { counts.sandwichPaid += 1; paid = 1; }
      } else if (status && PRESENT_STATUSES.has(status)) {
        paid = 1;
        if (half && half.leave > half.paid) {
          // Worked part of the day, but the other half was unpaid leave.
          paid = 1 - (half.leave - half.paid);
          counts.unpaidLeave += 1 - paid;
          reason = 'Unpaid half-day leave';
        }
        counts.present += paid;
      } else if (odDates.has(date)) {
        paid = 1;
        counts.present += 1;
      } else if (fullLeaveByDate.has(date)) {
        if (fullLeaveByDate.get(date)) { paid = 1; counts.paidLeave += 1; } else { counts.unpaidLeave += 1; reason = 'Unpaid leave'; }
      } else if (half) {
        // Half-day leave with no punch for the other half.
        paid = half.paid;
        counts.paidLeave += half.paid;
        counts.absent += 1 - half.paid;
        reason = 'Half-day leave, absent for the rest';
      } else if (status === 'leave' || status === 'holiday' || status === 'weekoff') {
        // Set by an admin from Attendance Records without a request behind it.
        paid = 1;
        if (status === 'leave') counts.paidLeave += 1; else counts.holidayWeekoff += 1;
      } else {
        // eslint-disable-next-line no-await-in-loop
        const working = await isWorkingDay({
          employeeId: employee.id,
          companyId: employee.companyId,
          brandId: employee.brandId,
          rosterGroupId: employee.rosterGroupId,
          dateStr: date,
        });
        if (!working) { paid = 1; counts.holidayWeekoff += 1; } else { counts.absent += 1; reason = 'Absent'; }
      }
      paidBySegment.set(segment.id, paidBySegment.get(segment.id) + paid);
    }

    paidDays += paid;
    if (paid < 1 && segment) lopDates.push({ date, lop: 1 - paid, reason });
  }

  // Days before joining / after leaving aren't LOP — they're simply not
  // part of this job — but they aren't paid either.
  return {
    monthDays: dates.length,
    paidDays,
    lopDays: dates.length - paidDays - counts.notEmployed,
    counts,
    lopDates,
    paidBySegment,
  };
}

// Employment window for the month: joining date and an accepted
// resignation's last working day bound it.
async function employmentWindow(employee, start, end) {
  let from = start;
  let to = end;
  if (employee.dateOfJoining && employee.dateOfJoining > from) from = employee.dateOfJoining;
  const resignation = await db.Resignation.findOne({
    where: { employeeId: employee.id, status: 'accepted', lastWorkingDate: { [Op.ne]: null } },
    order: [['decidedAt', 'DESC']],
    attributes: ['lastWorkingDate'],
  });
  if (resignation && resignation.lastWorkingDate < to) to = resignation.lastWorkingDate;
  return { from, to };
}

async function loadGroupCustomItems(groupId) {
  const items = await db.PayrollCustomItem.findAll({ where: { groupId, isActive: true } });
  return items.map((i) => i.get({ plain: true }));
}

// Rules for one assignment in one month: the month's frozen snapshot when the
// month was already generated with this template, else the live template.
function rulesFor(assignment, snapshot) {
  const snap = snapshot && snapshot.templates && snapshot.templates[String(assignment.templateId)];
  if (snap) return snap;
  return {
    rules: normalizeRules(assignment.template.rules),
    templateName: assignment.template.name,
  };
}

async function fyHistory(employee, year, month) {
  const fyStart = getFinancialYearStart(year, month);
  const rows = await db.EmployeePayroll.findAll({
    where: { employeeId: employee.id },
    attributes: ['periodYear', 'periodMonth', 'grossEarned', 'details'],
  });
  let ytdGross = 0;
  let ytdTds = 0;
  for (const row of rows) {
    if (getFinancialYearStart(row.periodYear, row.periodMonth) !== fyStart) continue;
    if (monthKey(row.periodYear, row.periodMonth) >= monthKey(year, month)) continue;
    ytdGross += Number(row.grossEarned) || 0;
    const tdsRow = ((row.details && row.details.deductions) || []).find((d) => d.key === 'tds');
    if (tdsRow) ytdTds += Number(tdsRow.amount) || 0;
  }
  return { ytdGross, ytdTds, remainingMonths: getRemainingMonthsInFY(month) };
}

// Computes one employee's month. Returns null when nothing is payable (no
// salary assignment overlaps the month). `existing` = the row being
// recalculated (keeps its rules snapshot and the carry adjustments it
// already absorbed).
async function computeEmployeeMonth({ employee, year, month, existing = null }) {
  const { start, end } = monthBounds(year, month);
  const assignments = await db.SalaryAssignment.findAll({
    where: {
      employeeId: employee.id,
      effectiveFrom: { [Op.lte]: end },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: start } }],
    },
    include: [{ model: db.PayrollTemplate, as: 'template', paranoid: false }],
    order: [['effectiveFrom', 'ASC']],
  });
  if (assignments.length === 0) return null;

  const window = await employmentWindow(employee, start, end);
  const segments = [];
  for (const a of assignments) {
    const from = [a.effectiveFrom, start, window.from].sort().pop();
    const to = [a.effectiveTo || end, end, window.to].sort()[0];
    if (from <= to) segments.push({ id: String(a.id), from, to, assignment: a });
  }
  if (segments.length === 0) return null;

  const days = await classifyDays({ employee, start, end, segments });
  const primary = segments[segments.length - 1].assignment;
  const snapshot = existing ? existing.rulesSnapshot : null;
  const customItemsRaw = await loadGroupCustomItems(primary.groupId);

  const templates = {};
  const resolved = (a) => {
    const r = rulesFor(a, snapshot);
    templates[String(a.templateId)] = r;
    const itemsSource = (snapshot && snapshot.customItems) || customItemsRaw;
    return { rules: r.rules, customItems: resolveCustomItems(r.rules, itemsSource) };
  };
  const salaryInput = (a) => ({
    monthlyCtc: Number(a.monthlyCtc),
    ...resolved(a),
    deductionsEnabled: a.deductionsEnabled,
    disabledItems: a.disabledItems || [],
    workState: employee.workState,
  });

  // Earned amounts add up across the month's salary parts; deductions are
  // then worked out once on the total, under the latest salary's rules.
  const earned = { basic: 0, hra: 0, gross: 0, ctc: 0 };
  for (const seg of segments) {
    const part = computeSalary({ ...salaryInput(seg.assignment), paidDays: days.paidBySegment.get(seg.id), monthDays: days.monthDays });
    for (const key of ['basic', 'hra']) earned[key] += part.earnings.find((e) => e.key === key).amount;
    earned.gross += part.actual.grossSalary;
    earned.ctc += Number(seg.assignment.monthlyCtc) * part.factor;
  }

  const tds = await fyHistory(employee, year, month);
  const salary = computeSalary({
    ...salaryInput(primary),
    paidDays: days.paidDays,
    monthDays: days.monthDays,
    tds,
    earnedOverride: segments.length > 1 ? earned : null,
  });

  // Arrears / recovery from earlier months' corrections. A fresh month picks
  // up every pending one; a recalculation keeps exactly the ones it already
  // absorbed (so a correction never hops between months).
  const carryWhere = existing
    ? { targetPayrollId: existing.id }
    : { employeeId: employee.id, status: 'pending' };
  const carries = (await db.PayrollCarryAdjustment.findAll({ where: carryWhere, order: [['sourceYear', 'ASC'], ['sourceMonth', 'ASC']] }))
    .filter((c) => monthKey(c.sourceYear, c.sourceMonth) < monthKey(year, month));
  const carryAdjustment = carries.reduce((s, c) => s + Number(c.amount), 0);
  const netPay = salary.actual.inHand + carryAdjustment;

  const company = await db.Company.findByPk(employee.companyId, { attributes: ['id', 'name'] });
  const details = {
    companyName: company ? company.name : null,
    templateName: templates[String(primary.templateId)].templateName,
    ctcPeriod: primary.ctcPeriod,
    deductionsEnabled: primary.deductionsEnabled,
    salaryParts: segments.map((s) => ({ from: s.from, to: s.to, monthlyCtc: Number(s.assignment.monthlyCtc) })),
    earnings: salary.earnings,
    deductions: salary.deductions,
    employer: salary.employer,
    full: salary.full,
    actual: salary.actual,
    pfSplit: salary.pfSplit,
    wageRule: salary.wageRule,
    warnings: salary.warnings,
    days: days.counts,
    lopDates: days.lopDates,
    carries: carries.map((c) => ({ id: String(c.id), sourceYear: c.sourceYear, sourceMonth: c.sourceMonth, amount: Number(c.amount) })),
  };

  return {
    values: {
      companyId: employee.companyId,
      groupId: primary.groupId,
      employeeId: employee.id,
      assignmentId: primary.id,
      periodYear: year,
      periodMonth: month,
      periodStart: start,
      periodEnd: end,
      monthDays: days.monthDays,
      paidDays: days.paidDays,
      lopDays: days.lopDays,
      monthlyCtc: Number(primary.monthlyCtc),
      grossFull: salary.full.grossSalary,
      grossEarned: salary.actual.grossSalary,
      totalDeductions: salary.actual.totalDeductions,
      totalEmployer: salary.actual.totalEmployer,
      carryAdjustment,
      netPay,
      details,
      rulesSnapshot: snapshot || { templates, customItems: customItemsRaw },
    },
    carries,
  };
}

const COMPARED = ['monthDays', 'paidDays', 'lopDays', 'monthlyCtc', 'grossFull', 'grossEarned', 'totalDeductions', 'totalEmployer', 'carryAdjustment', 'netPay'];

// Generates a month for one employee if it doesn't exist yet. Returns the row
// (existing or new), or null when there's nothing to pay.
async function generateEmployeeMonth({ employeeId, year, month }) {
  return runAsCompany(null, async () => {
    if (!isMonthComplete(year, month)) return null;
    const existing = await db.EmployeePayroll.findOne({ where: { employeeId, periodYear: year, periodMonth: month } });
    if (existing) return existing;
    const employee = await db.Employee.findByPk(employeeId);
    if (!employee) return null;

    const result = await computeEmployeeMonth({ employee, year, month });
    if (!result) return null;

    const row = await db.sequelize.transaction(async (t) => {
      let created;
      try {
        created = await db.EmployeePayroll.create(
          { ...result.values, originalNet: result.values.netPay, generatedAt: new Date(), revision: 1 },
          { transaction: t }
        );
      } catch (err) {
        // Two generators raced (cron + an assignment catch-up) — the other won.
        if (err.name === 'SequelizeUniqueConstraintError') return null;
        throw err;
      }
      if (result.carries.length > 0) {
        await db.PayrollCarryAdjustment.update(
          { status: 'applied', targetPayrollId: created.id, targetYear: year, targetMonth: month },
          { where: { id: { [Op.in]: result.carries.map((c) => c.id) } }, transaction: t }
        );
      }
      return created;
    });

    if (row && employee.userId) {
      await notifyUser({
        companyId: employee.companyId,
        userId: employee.userId,
        type: 'payroll_generated',
        requestType: 'payroll',
        requestId: row.id,
        title: `Your ${monthLabel(year, month)} salary is ready`,
        body: `In-hand ₹${row.netPay.toLocaleString('en-IN')}`,
      });
    }
    return row;
  });
}

// Recalculates an existing month in place. If the net pay moved, the
// difference against what was already credited (original_net) goes to a
// pending carry adjustment for the next payroll, and the employee is told.
async function recalculatePayroll(payrollId) {
  return runAsCompany(null, async () => {
    const row = await db.EmployeePayroll.findByPk(payrollId);
    if (!row) return null;
    const employee = await db.Employee.findByPk(row.employeeId);
    if (!employee) return null;

    const result = await computeEmployeeMonth({ employee, year: row.periodYear, month: row.periodMonth, existing: row });
    if (!result) {
      // Salary assignment removed for this month — keep the row (history) but
      // stop recalculating it.
      await row.update({ needsRecalc: false });
      return row;
    }

    const changed =
      COMPARED.some((k) => Math.abs(Number(row[k]) - Number(result.values[k])) > 0.001) ||
      JSON.stringify(row.details.lopDates) !== JSON.stringify(result.values.details.lopDates);

    await db.sequelize.transaction(async (t) => {
      const updates = { ...result.values, needsRecalc: false };
      delete updates.rulesSnapshot;
      if (changed) {
        updates.revision = row.revision + 1;
        updates.revisedAt = new Date();
      }
      await row.update(updates, { transaction: t });

      const sourced = await db.PayrollCarryAdjustment.findAll({ where: { sourcePayrollId: row.id }, transaction: t });
      const alreadyCarried = sourced.reduce((s, c) => s + Number(c.amount), 0);
      const diff = Math.round((row.netPay - row.originalNet - alreadyCarried) * 100) / 100;
      if (Math.abs(diff) >= 0.01) {
        const pending = sourced.find((c) => c.status === 'pending');
        if (pending) {
          const amount = Math.round((Number(pending.amount) + diff) * 100) / 100;
          if (Math.abs(amount) < 0.01) await pending.destroy({ transaction: t });
          else await pending.update({ amount }, { transaction: t });
        } else {
          await db.PayrollCarryAdjustment.create(
            {
              companyId: row.companyId,
              employeeId: row.employeeId,
              sourcePayrollId: row.id,
              sourceYear: row.periodYear,
              sourceMonth: row.periodMonth,
              amount: diff,
              status: 'pending',
            },
            { transaction: t }
          );
        }
      }
    });

    if (changed && employee.userId) {
      const label = monthLabel(row.periodYear, row.periodMonth);
      await notifyUser({
        companyId: employee.companyId,
        userId: employee.userId,
        type: 'payroll_revised',
        requestType: 'payroll',
        requestId: row.id,
        title: `Your ${label} salary was updated`,
        body: `In-hand is now ₹${row.netPay.toLocaleString('en-IN')}. Any difference is adjusted in your next salary.`,
      });
    }
    return row;
  });
}

// Generates every employee's payroll for one month (idempotent — existing
// rows are left alone). groupId narrows it to one Group.
async function generateMonthForAll({ year, month, groupId = null }) {
  return runAsCompany(null, async () => {
    if (!isMonthComplete(year, month)) return { created: 0 };
    const { start, end } = monthBounds(year, month);
    const where = {
      effectiveFrom: { [Op.lte]: end },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: start } }],
    };
    if (groupId) where.groupId = groupId;
    const assignments = await db.SalaryAssignment.findAll({ where, attributes: ['employeeId'] });
    const employeeIds = [...new Set(assignments.map((a) => String(a.employeeId)))];
    let created = 0;
    for (const employeeId of employeeIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const before = await db.EmployeePayroll.count({ where: { employeeId, periodYear: year, periodMonth: month } });
        // eslint-disable-next-line no-await-in-loop
        const row = await generateEmployeeMonth({ employeeId, year, month });
        if (row && before === 0) created += 1;
      } catch (err) {
        console.error(`Payroll generation failed for employee ${employeeId} ${month}/${year}:`, err);
      }
    }
    return { created };
  });
}

// Catches an employee up on every completed month from `fromDate` (capped to
// 24 months back) — used right after a salary is assigned with a past
// effective date.
async function catchUpEmployee({ employeeId, fromDate }) {
  const { year, month } = previousMonth();
  const lastEnd = monthBounds(year, month).end;
  if (fromDate > lastEnd) return;
  const months = monthsBetween(fromDate, lastEnd).slice(-24);
  for (const m of months) {
    // eslint-disable-next-line no-await-in-loop
    await generateEmployeeMonth({ employeeId, year: m.year, month: m.month });
  }
}

// Marks already-generated months touching [fromDate, toDate] for
// recalculation and kicks it off right away (after the caller's transaction
// commits, if one is passed). The cron (jobs/payrollGeneration.job.js) picks
// up anything left behind. Always best-effort — never fails the caller.
async function queuePayrollRecalc({ employeeId, fromDate, toDate, transaction = null }) {
  const run = async () => {
    try {
      const months = monthsBetween(fromDate, toDate || fromDate);
      const rows = await runAsCompany(null, () =>
        db.EmployeePayroll.findAll({
          where: {
            employeeId,
            [Op.or]: months.map((m) => ({ periodYear: m.year, periodMonth: m.month })),
          },
          attributes: ['id'],
        })
      );
      if (rows.length === 0) return;
      await runAsCompany(null, () =>
        db.EmployeePayroll.update({ needsRecalc: true }, { where: { id: { [Op.in]: rows.map((r) => r.id) } } })
      );
      for (const r of rows) {
        // eslint-disable-next-line no-await-in-loop
        await recalculatePayroll(r.id);
      }
    } catch (err) {
      console.error('Payroll recalculation failed:', err);
    }
  };
  if (transaction && typeof transaction.afterCommit === 'function') {
    transaction.afterCommit(() => {
      setImmediate(run);
    });
  } else {
    setImmediate(run);
  }
}

async function processPendingRecalcs() {
  const rows = await runAsCompany(null, () =>
    db.EmployeePayroll.findAll({ where: { needsRecalc: true }, attributes: ['id'], limit: 500 })
  );
  for (const r of rows) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await recalculatePayroll(r.id);
    } catch (err) {
      console.error(`Payroll recalculation failed for ${r.id}:`, err);
    }
  }
  return rows.length;
}

module.exports = {
  monthBounds,
  monthsBetween,
  isMonthComplete,
  previousMonth,
  computeEmployeeMonth,
  generateEmployeeMonth,
  generateMonthForAll,
  recalculatePayroll,
  catchUpEmployee,
  queuePayrollRecalc,
  processPendingRecalcs,
};
