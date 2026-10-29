'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { runAsCompany } = require('../../config/tenant-context');
const { datesBetween, dateOnly } = require('../../utils/dateRange');
const { isWorkingDay } = require('../../utils/workingDays');
const { getFinancialYearStart, getRemainingMonthsInFY } = require('../../utils/financialYear');
const { notifyUser } = require('../../utils/notifications');
const { normalizeRules, resolveCustomItems, computeSalary } = require('./payrollRules');
const { memberItemIds } = require('./customItemMembers');

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
      } else if (status === 'half_day' && !half && !odDates.has(date)) {
        // Marked half day with no half-day leave behind it (admin / a
        // regularization): only half the day was worked.
        paid = 0.5;
        counts.present += 0.5;
        counts.absent += 0.5;
        reason = 'Half day';
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

// The employee's last working day, if they're leaving: the earlier of an
// accepted resignation's last day and the one recorded when an admin marked
// them exited / inactive (employees.last_working_date).
async function exitDateOf(employee) {
  const resignation = await db.Resignation.findOne({
    where: { employeeId: employee.id, status: 'accepted', lastWorkingDate: { [Op.ne]: null } },
    order: [['decidedAt', 'DESC']],
    attributes: ['lastWorkingDate'],
  });
  const dates = [resignation && resignation.lastWorkingDate, employee.lastWorkingDate].filter(Boolean).sort();
  return dates[0] || null;
}

// Employment window for the month: joining date and the last working day
// bound it.
async function employmentWindow(employee, start, end) {
  let from = start;
  let to = end;
  if (employee.dateOfJoining && employee.dateOfJoining > from) from = employee.dateOfJoining;
  const exitDate = await exitDateOf(employee);
  if (exitDate && exitDate < to) to = exitDate;
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
  // Normalized so a snapshot saved under an older rules shape still reads.
  if (snap) return { ...snap, rules: normalizeRules(snap.rules) };
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
  // Taxable one-time bonuses of earlier months count as income too.
  let ytdGross = 0;
  let ytdTds = 0;
  for (const row of rows) {
    if (getFinancialYearStart(row.periodYear, row.periodMonth) !== fyStart) continue;
    if (monthKey(row.periodYear, row.periodMonth) >= monthKey(year, month)) continue;
    ytdGross += (Number(row.grossEarned) || 0) + (Number(row.details && row.details.actual && row.details.actual.taxableBonus) || 0);
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
  // Final settlement: the last salary part ends inside the month (salary
  // ended, or the last working day) and nothing starts after it.
  const lastTo = segments[segments.length - 1].to;
  let finalDate = null;
  if (lastTo < end) {
    const later = await db.SalaryAssignment.count({ where: { employeeId: employee.id, effectiveFrom: { [Op.gt]: lastTo } } });
    if (later === 0) finalDate = lastTo;
  }
  const snapshot = existing ? existing.rulesSnapshot : null;
  // Only the items this employee was chosen for.
  const mine = (await memberItemIds([employee.id])).get(String(employee.id)) || new Set();
  const myItems = (await loadGroupCustomItems(primary.groupId)).filter((i) => mine.has(String(i.id)));
  const limited = (i) => Array.isArray(i.months) && i.months.length > 0;
  // Every-month items come from the month's frozen snapshot (already narrowed
  // to this employee; an older snapshot is narrowed here); items limited to
  // chosen months are always read live (adding / changing one is meant to
  // change exactly those months), and apply only in those months.
  const snapItems = snapshot && snapshot.customItems
    ? snapshot.customItems.filter((i) => snapshot.itemsPerEmployee || mine.has(String(i.id)))
    : null;
  const thisMonth = `${year}-${pad(month)}`;
  const itemsSource = [
    ...(snapItems || myItems).filter((i) => !limited(i)),
    ...myItems.filter((i) => limited(i) && i.months.includes(thisMonth)),
  ];

  const templates = {};
  const resolved = (a) => {
    const r = rulesFor(a, snapshot);
    templates[String(a.templateId)] = r;
    return { rules: r.rules, customItems: resolveCustomItems(r.rules, itemsSource) };
  };
  const salaryInput = (a) => ({
    monthlyGross: Number(a.monthlyGross),
    ...resolved(a),
    deductionsEnabled: a.deductionsEnabled,
    disabledItems: a.disabledItems || [],
    workState: employee.workState,
  });

  // Earned amounts add up across the month's salary parts; deductions are
  // then worked out once on the total, under the latest salary's rules.
  const earned = { basic: 0, hra: 0, gross: 0, allowances: {} };
  for (const seg of segments) {
    const part = computeSalary({ ...salaryInput(seg.assignment), paidDays: days.paidBySegment.get(seg.id), monthDays: days.monthDays });
    for (const key of ['basic', 'hra']) earned[key] += part.earnings.find((e) => e.key === key).amount;
    for (const row of part.earnings.filter((e) => e.key.startsWith('custom_'))) {
      earned.allowances[row.key] = (earned.allowances[row.key] || 0) + row.amount;
    }
    earned.gross += part.actual.grossSalary;
  }

  const tds = await fyHistory(employee, year, month);
  const bonuses = await db.PayrollBonus.findAll({
    where: { employeeId: employee.id, periodYear: year, periodMonth: month },
    order: [['createdAt', 'ASC']],
  });
  const salary = computeSalary({
    ...salaryInput(primary),
    paidDays: days.paidDays,
    monthDays: days.monthDays,
    tds,
    earnedOverride: segments.length > 1 ? earned : null,
    bonuses: bonuses.map((b) => ({
      id: b.id,
      type: b.type,
      title: b.title,
      amount: b.amount,
      taxable: b.taxable,
      calcType: b.calcType,
      percent: b.percent,
      basis: b.basis,
    })),
  });

  // Arrears / recovery carried from earlier months. A fresh month — or one
  // not locked yet (not paid) — picks up every pending one; a locked month
  // keeps exactly the ones it already absorbed (paid money never moves).
  const pendingWhere = { employeeId: employee.id, status: 'pending' };
  let carryWhere = pendingWhere;
  if (existing) {
    carryWhere = existing.lockedAt ? { targetPayrollId: existing.id } : { [Op.or]: [{ targetPayrollId: existing.id }, pendingWhere] };
  }
  const carries = (await db.PayrollCarryAdjustment.findAll({ where: carryWhere, order: [['sourceYear', 'ASC'], ['sourceMonth', 'ASC']] }))
    .filter((c) => monthKey(c.sourceYear, c.sourceMonth) < monthKey(year, month));
  const carryAdjustment = Math.round(carries.reduce((s, c) => s + Number(c.amount), 0) * 100) / 100;
  // In-hand never goes below zero: what couldn't be recovered this month
  // (fixed deductions on a month with almost no paid days, a large recovery)
  // is carried to the next salary as a 'shortfall' recovery.
  const rawNet = Math.round((salary.actual.inHand + carryAdjustment) * 100) / 100;
  const shortfall = rawNet < 0 ? -rawNet : 0;
  const netPay = rawNet < 0 ? 0 : rawNet;
  if (shortfall > 0) {
    salary.warnings.push(`Deductions are more than this month's pay — ₹${shortfall.toLocaleString('en-IN')} will be recovered from the next salary`);
  }

  const company = await db.Company.findByPk(employee.companyId, { attributes: ['id', 'name'] });
  const details = {
    companyName: company ? company.name : null,
    templateName: templates[String(primary.templateId)].templateName,
    grossPeriod: primary.grossPeriod,
    deductionsEnabled: primary.deductionsEnabled,
    salaryParts: segments.map((s) => ({ from: s.from, to: s.to, monthlyGross: Number(s.assignment.monthlyGross) })),
    earnings: salary.earnings,
    bonuses: salary.bonuses,
    deductions: salary.deductions,
    employer: salary.employer,
    full: salary.full,
    actual: salary.actual,
    pfSplit: salary.pfSplit,
    wageRule: salary.wageRule,
    warnings: salary.warnings,
    days: days.counts,
    lopDates: days.lopDates,
    carries: carries.map((c) => ({ id: String(c.id), kind: c.kind, sourceYear: c.sourceYear, sourceMonth: c.sourceMonth, amount: Number(c.amount) })),
    shortfall,
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
      monthlyGross: Number(primary.monthlyGross),
      grossFull: salary.full.grossSalary,
      grossEarned: salary.actual.grossSalary,
      totalDeductions: salary.actual.totalDeductions,
      totalEmployer: salary.actual.totalEmployer,
      bonusTotal: salary.actual.bonusTotal,
      carryAdjustment,
      netPay,
      isFinal: !!finalDate,
      finalDate,
      details,
      rulesSnapshot: snapshot || { templates, customItems: myItems.filter((i) => !limited(i)), itemsPerEmployee: true },
    },
    carries,
    shortfall,
    // A % bonus's amount follows the month's salary — written back to the
    // bonus row after saving (syncBonusAmounts) so lists show the real figure.
    bonusSync: bonuses
      .filter((b) => b.calcType === 'percent')
      .map((b) => ({ bonus: b, amount: (salary.bonuses.find((r) => r.id === String(b.id)) || { amount: 0 }).amount })),
  };
}

async function syncBonusAmounts(result) {
  for (const { bonus, amount } of (result && result.bonusSync) || []) {
    if (Math.abs(Number(bonus.amount) - amount) >= 0.01) {
      // eslint-disable-next-line no-await-in-loop
      await bonus.update({ amount });
    }
  }
}

const COMPARED = ['monthDays', 'paidDays', 'lopDays', 'monthlyGross', 'grossFull', 'grossEarned', 'totalDeductions', 'totalEmployer', 'bonusTotal', 'carryAdjustment', 'netPay'];

// Generates a month for one employee if it doesn't exist yet. Returns the row
// (existing or new), or null when there's nothing to pay.
async function generateEmployeeMonth({ employeeId, year, month }) {
  return runAsCompany(null, async () => {
    if (!isMonthComplete(year, month)) {
      // A running month is payable early only as a final settlement, once
      // its last salary date has come.
      const last = await finalDateFor(employeeId, year, month);
      if (!last || last > dateOnly(new Date())) return null;
    }
    const existing = await db.EmployeePayroll.findOne({ where: { employeeId, periodYear: year, periodMonth: month } });
    if (existing) return existing;
    const employee = await db.Employee.findByPk(employeeId);
    if (!employee) return null;

    const result = await computeEmployeeMonth({ employee, year, month });
    if (!result) return null;

    // A recalculation of an earlier month may change (or settle) one of the
    // pending carries between computing and saving — then work it out again.
    let attempt = result;
    for (let tries = 1; ; tries += 1) {
      const outcome = await saveNewMonth(attempt);
      if (outcome !== STALE_CARRIES) {
        if (outcome) await syncBonusAmounts(attempt);
        return outcome;
      }
      if (tries >= 3) throw new Error(`Payroll carry adjustments kept changing for employee ${employeeId} ${month}/${year}`);
      // eslint-disable-next-line no-await-in-loop
      attempt = await computeEmployeeMonth({ employee, year, month });
      if (!attempt) return null;
    }
  });
}

const STALE_CARRIES = Symbol('stale carries');
const round2 = (n) => Math.round(n * 100) / 100;

// Locks the carries a month is about to absorb. Throws STALE_CARRIES when one
// changed since the month was worked out (amount edited, or taken by another
// month) — the caller then works the month out again.
async function claimCarries(result, rowId, t) {
  if (result.carries.length === 0) return;
  const current = await db.PayrollCarryAdjustment.findAll({
    where: { id: { [Op.in]: result.carries.map((c) => c.id) } },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  const byId = new Map(current.map((c) => [String(c.id), c]));
  const stale = result.carries.some((c) => {
    const now = byId.get(String(c.id));
    if (!now || Number(now.amount) !== Number(c.amount)) return true;
    const mine = rowId && now.status === 'applied' && String(now.targetPayrollId) === String(rowId);
    return !mine && now.status !== 'pending';
  });
  if (stale) throw STALE_CARRIES;
}

async function markCarriesApplied(result, row, t) {
  const ids = result.carries.map((c) => c.id);
  if (ids.length === 0) return;
  await db.PayrollCarryAdjustment.update(
    { status: 'applied', targetPayrollId: row.id, targetYear: row.periodYear, targetMonth: row.periodMonth },
    { where: { id: { [Op.in]: ids }, status: 'pending' }, transaction: t }
  );
}

// Adjusts the carries sourced from `row` of one kind so they add up to
// `target`: the still-pending one absorbs the difference, or a new one is
// made when the earlier ones were already applied. Returns true on a change.
async function settleSourcedCarries(row, kind, target, sourced, t) {
  const mine = sourced.filter((c) => (c.kind || 'correction') === kind);
  const diff = round2(target - mine.reduce((s, c) => s + Number(c.amount), 0));
  if (Math.abs(diff) < 0.01) return false;
  const pending = mine.find((c) => c.status === 'pending');
  if (pending) {
    const amount = round2(Number(pending.amount) + diff);
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
        kind,
        status: 'pending',
      },
      { transaction: t }
    );
  }
  return true;
}

// A carry out of this month changed: the next month that isn't locked yet
// (if one exists — e.g. a final settlement) takes it in right away rather
// than leaving it for a month that may never come.
function pickUpInLaterMonth(row) {
  setImmediate(async () => {
    try {
      const later = await runAsCompany(null, () =>
        db.EmployeePayroll.findOne({
          where: {
            employeeId: row.employeeId,
            lockedAt: null,
            [Op.or]: [
              { periodYear: { [Op.gt]: row.periodYear } },
              { periodYear: row.periodYear, periodMonth: { [Op.gt]: row.periodMonth } },
            ],
          },
          order: [['periodYear', 'ASC'], ['periodMonth', 'ASC']],
          attributes: ['id'],
        })
      );
      if (later) await recalculatePayroll(later.id);
    } catch (err) {
      console.error('Carrying a payroll adjustment forward failed:', err);
    }
  });
}

async function saveNewMonth(result) {
  let carriesChanged = false;
  try {
    const created = await db.sequelize.transaction(async (t) => {
      await claimCarries(result, null, t);
      const row = await db.EmployeePayroll.create(
        { ...result.values, originalNet: result.values.netPay, generatedAt: new Date(), revision: 1 },
        { transaction: t }
      );
      await markCarriesApplied(result, row, t);
      carriesChanged = await settleSourcedCarries(row, 'shortfall', -result.shortfall, [], t);
      return row;
    });
    if (carriesChanged) pickUpInLaterMonth(created);
    return created;
  } catch (err) {
    if (err === STALE_CARRIES) return STALE_CARRIES;
    // Two generators raced (cron + an assignment catch-up) — the other won.
    if (err.name === 'SequelizeUniqueConstraintError') return null;
    throw err;
  }
}

// Recalculations of the same month run one after another in this process
// (two leave / attendance changes landing together would otherwise both
// read the old row); the row lock below covers other processes.
const recalcChains = new Map();

function recalculatePayroll(payrollId) {
  const key = String(payrollId);
  const run = (recalcChains.get(key) || Promise.resolve()).then(() => recalculatePayrollNow(payrollId));
  const tail = run.catch(() => {});
  recalcChains.set(key, tail);
  tail.then(() => {
    if (recalcChains.get(key) === tail) recalcChains.delete(key);
  });
  return run;
}

// Recalculates an existing month in place.
// - Not locked (salary not paid yet): the month simply changes — no arrears —
//   and it takes in any arrears still waiting from earlier months.
// - Locked (paid): the difference against what was already credited
//   (original_net) goes to a pending 'correction' carry for the next payroll.
// Either way an amount that couldn't be recovered (in-hand floored at zero)
// is carried forward as a 'shortfall' recovery. The employee is told when a
// month they can already see changes.
async function recalculatePayrollNow(payrollId) {
  return runAsCompany(null, async () => {
    const row = await db.EmployeePayroll.findByPk(payrollId);
    if (!row) return null;
    const employee = await db.Employee.findByPk(row.employeeId);
    if (!employee) return null;

    let result;
    let saved;
    let changed = false;
    let carriesChanged = false;
    for (let tries = 1; ; tries += 1) {
      // eslint-disable-next-line no-await-in-loop
      result = await computeEmployeeMonth({ employee, year: row.periodYear, month: row.periodMonth, existing: row });
      if (!result) {
        // Salary assignment removed for this month — keep the row (history)
        // but stop recalculating it.
        // eslint-disable-next-line no-await-in-loop
        await row.update({ needsRecalc: false });
        return row;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        saved = await db.sequelize.transaction(async (t) => {
          // Re-read under a row lock: a recalculation of this month in another
          // process waits here, so both never create a carry for the same change.
          const current = await db.EmployeePayroll.findByPk(row.id, { transaction: t, lock: t.LOCK.UPDATE });
          if (!current) return null;
          if (Boolean(current.lockedAt) !== Boolean(row.lockedAt)) throw STALE_CARRIES; // locked meanwhile
          await claimCarries(result, current.id, t);
          changed =
            COMPARED.some((k) => Math.abs(Number(current[k]) - Number(result.values[k])) > 0.001) ||
            JSON.stringify(current.details.lopDates) !== JSON.stringify(result.values.details.lopDates) ||
            JSON.stringify(current.details.bonuses || []) !== JSON.stringify(result.values.details.bonuses);

          const updates = { ...result.values, needsRecalc: false };
          delete updates.rulesSnapshot;
          if (changed) {
            updates.revision = current.revision + 1;
            updates.revisedAt = new Date();
          }

          const sourced = await db.PayrollCarryAdjustment.findAll({
            where: { sourcePayrollId: current.id },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          const corrections = sourced.filter((c) => (c.kind || 'correction') === 'correction');

          if (!current.lockedAt) {
            // Not paid yet: drop corrections still waiting (left from before
            // an unlock) and treat the new figure as what will be credited.
            // Ones already applied to a later month stay — that money moved.
            for (const c of corrections.filter((s) => s.status === 'pending')) {
              // eslint-disable-next-line no-await-in-loop
              await c.destroy({ transaction: t });
              carriesChanged = true;
            }
            const applied = corrections.filter((c) => c.status !== 'pending');
            updates.originalNet = round2(updates.netPay - applied.reduce((s, c) => s + Number(c.amount), 0));
            await current.update(updates, { transaction: t });
          } else {
            await current.update(updates, { transaction: t });
            const alreadyCarried = corrections.reduce((s, c) => s + Number(c.amount), 0);
            const target = round2(current.netPay - current.originalNet);
            if (Math.abs(target - alreadyCarried) >= 0.01) {
              carriesChanged = (await settleSourcedCarries(current, 'correction', target, corrections, t)) || carriesChanged;
            }
          }
          await markCarriesApplied(result, current, t);
          carriesChanged = (await settleSourcedCarries(current, 'shortfall', -result.shortfall, sourced, t)) || carriesChanged;
          return current;
        });
        break;
      } catch (err) {
        if (err !== STALE_CARRIES || tries >= 3) throw err;
        // eslint-disable-next-line no-await-in-loop
        await row.reload();
      }
    }
    if (!saved) return null;

    await syncBonusAmounts(result);
    if (carriesChanged) pickUpInLaterMonth(saved);
    // Only a month the employee can already see is worth telling them about.
    if (changed && saved.payslipReleased && employee.userId) {
      const label = monthLabel(saved.periodYear, saved.periodMonth);
      await notifyUser({
        companyId: employee.companyId,
        userId: employee.userId,
        type: 'payroll_revised',
        requestType: 'payroll',
        requestId: saved.id,
        title: `Your ${label} salary was updated`,
        body: saved.lockedAt
          ? `In-hand is now ₹${saved.netPay.toLocaleString('en-IN')}. Any difference is adjusted in your next salary.`
          : `In-hand is now ₹${saved.netPay.toLocaleString('en-IN')}.`,
      });
    }
    return saved;
  });
}

// Locks (salary paid — later changes become arrears) or unlocks months.
// Locking first works every month out again so the lock captures the latest
// figure (a holiday / roster change since); unlocking recalculates right away
// so waiting arrears fold back into the month itself.
async function setPayrollLock(ids, lock, actorUserId) {
  if (lock) {
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await recalculatePayroll(id);
    }
  }
  await runAsCompany(null, () =>
    db.EmployeePayroll.update(
      lock ? { lockedAt: new Date(), lockedByUserId: actorUserId || null } : { lockedAt: null, lockedByUserId: null },
      { where: { id: { [Op.in]: ids } } }
    )
  );
  if (!lock) {
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await recalculatePayroll(id);
    }
  }
}

// Recalculates the months not locked yet (drafts — salary not paid) for the
// employees matched, over [fromDate, toDate] (background, best-effort). Used
// when something every day-count depends on changes: a holiday, a joining /
// last working date, a work state, a resignation. Locked months are left
// alone — HR can recalculate one by hand.
function recalcUnlocked({ employeeIds = null, employeeWhere = null, fromDate, toDate = null }) {
  setImmediate(async () => {
    try {
      const where = { lockedAt: null };
      if (fromDate) {
        const months = monthsBetween(fromDate, toDate || dateOnly(new Date()));
        where[Op.or] = months.map((m) => ({ periodYear: m.year, periodMonth: m.month }));
      }
      if (employeeIds) where.employeeId = { [Op.in]: employeeIds.map(String) };
      const rows = await runAsCompany(null, () =>
        db.EmployeePayroll.findAll({
          where,
          attributes: ['id'],
          include: employeeWhere ? [{ model: db.Employee, as: 'employee', attributes: [], where: employeeWhere, required: true }] : [],
        })
      );
      for (const r of rows) {
        // eslint-disable-next-line no-await-in-loop
        await recalculatePayroll(r.id);
      }
    } catch (err) {
      console.error('Recalculating unlocked payroll months failed:', err);
    }
  });
}

// An employee's joining date, last working day or work state changed:
// months not locked yet are worked out again from `fromDate` (null = all of
// them), and when the last working day has already come in the running
// month, its final settlement is made now. Best-effort, never throws.
function afterEmployeePayChange(employeeId, fromDate = null) {
  recalcUnlocked({ employeeIds: [employeeId], fromDate });
  setImmediate(async () => {
    try {
      const today = dateOnly(new Date());
      const [y, m] = today.split('-').map(Number);
      const last = await runAsCompany(null, () => finalDateFor(employeeId, y, m));
      if (last && last <= today) await generateEmployeeMonth({ employeeId, year: y, month: m });
    } catch (err) {
      console.error(`Final settlement after an exit change failed for employee ${employeeId}:`, err);
    }
  });
}

// Nightly: every month not locked yet in the last `months` months is worked
// out again, so a draft always reflects the latest roster / shift / holiday
// data even when the change itself didn't trigger a recalculation.
async function refreshUnlockedMonths({ months = 3 } = {}) {
  const { year, month } = previousMonth();
  const fromKey = monthKey(year, month) - (months - 1);
  const rows = await runAsCompany(null, () =>
    db.EmployeePayroll.findAll({ where: { lockedAt: null }, attributes: ['id', 'periodYear', 'periodMonth'] })
  );
  let refreshed = 0;
  for (const r of rows.filter((x) => monthKey(x.periodYear, x.periodMonth) >= fromKey)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await recalculatePayroll(r.id);
      refreshed += 1;
    } catch (err) {
      console.error(`Payroll refresh failed for ${r.id}:`, err);
    }
  }
  return refreshed;
}

// The last payable date inside the month when pay stops there — the salary
// ends (nothing starts after it) or the employee's last working day falls in
// it; else null.
async function finalDateFor(employeeId, year, month) {
  const { start, end } = monthBounds(year, month);
  const assignments = await db.SalaryAssignment.findAll({
    where: {
      employeeId,
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: start } }],
    },
    attributes: ['effectiveFrom', 'effectiveTo'],
    order: [['effectiveFrom', 'ASC']],
  });
  if (assignments.length === 0) return null;
  const last = assignments[assignments.length - 1];
  const candidates = [];
  if (last.effectiveTo && last.effectiveTo < end && last.effectiveFrom <= end) candidates.push(last.effectiveTo);
  const employee = await db.Employee.findByPk(employeeId, { attributes: ['id', 'lastWorkingDate'] });
  const exitDate = employee ? await exitDateOf(employee) : null;
  if (exitDate && exitDate >= start && exitDate < end && exitDate >= assignments[0].effectiveFrom) candidates.push(exitDate);
  return candidates.sort()[0] || null;
}

// Final settlements of the running month: salaries that ended, or employees
// whose last working day was, on or before today get that month generated now; a final month whose last day was
// today or yesterday is refreshed (that day's attendance may have come in
// after it was first worked out). Run daily by the payroll job, and right
// after a salary is ended.
async function generateFinalSettlements(today = dateOnly(new Date())) {
  return runAsCompany(null, async () => {
    const [y, m] = today.split('-').map(Number);
    const { start } = monthBounds(y, m);
    const [ended, exited, resigned] = await Promise.all([
      db.SalaryAssignment.findAll({
        where: { status: 'ended', effectiveTo: { [Op.between]: [start, today] } },
        attributes: ['employeeId'],
      }),
      db.Employee.findAll({ where: { lastWorkingDate: { [Op.between]: [start, today] } }, attributes: [['id', 'employeeId']] }),
      db.Resignation.findAll({
        where: { status: 'accepted', lastWorkingDate: { [Op.between]: [start, today] } },
        attributes: ['employeeId'],
      }),
    ]);
    let created = 0;
    const leaving = [...ended, ...exited, ...resigned].map((r) => String(r.get('employeeId')));
    for (const employeeId of [...new Set(leaving)]) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const before = await db.EmployeePayroll.count({ where: { employeeId, periodYear: y, periodMonth: m } });
        // eslint-disable-next-line no-await-in-loop
        const row = await generateEmployeeMonth({ employeeId, year: y, month: m });
        if (row && before === 0) created += 1;
      } catch (err) {
        console.error(`Final settlement failed for employee ${employeeId}:`, err);
      }
    }
    const yesterday = dateOnly(new Date(new Date(`${today}T00:00:00`).getTime() - 86400000));
    const fresh = await db.EmployeePayroll.findAll({
      where: { isFinal: true, finalDate: { [Op.between]: [yesterday, today] } },
      attributes: ['id'],
    });
    for (const r of fresh) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await recalculatePayroll(r.id);
      } catch (err) {
        console.error(`Final settlement refresh failed for ${r.id}:`, err);
      }
    }
    return { created, refreshed: fresh.length };
  });
}

// Generates every employee's payroll for one month (idempotent — existing
// rows are left alone). groupId narrows it to one Group.
// `employeeWhere` (Employee where-clause) narrows it to a Company / Brand
// manager's own employees; omitted = everyone (in the Group, if given).
async function generateMonthForAll({ year, month, groupId = null, employeeWhere = null }) {
  return runAsCompany(null, async () => {
    if (!isMonthComplete(year, month)) return { created: 0 };
    const { start, end } = monthBounds(year, month);
    const where = {
      effectiveFrom: { [Op.lte]: end },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: start } }],
    };
    if (groupId) where.groupId = groupId;
    const assignments = await db.SalaryAssignment.findAll({
      where,
      attributes: ['employeeId'],
      include: employeeWhere ? [{ model: db.Employee, as: 'employee', attributes: [], where: employeeWhere, required: true }] : [],
    });
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
  generateFinalSettlements,
  finalDateFor,
  monthBounds,
  monthsBetween,
  isMonthComplete,
  previousMonth,
  computeEmployeeMonth,
  generateEmployeeMonth,
  generateMonthForAll,
  recalculatePayroll,
  setPayrollLock,
  recalcUnlocked,
  afterEmployeePayChange,
  refreshUnlockedMonths,
  catchUpEmployee,
  queuePayrollRecalc,
  processPendingRecalcs,
};
