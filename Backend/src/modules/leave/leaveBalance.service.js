'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { toBusinessLocal, dateOnly } = require('../../utils/dateRange');
const { resolveLeaveCycle } = require('../../utils/leaveCycle');

// Monthly accrual is credited whole-month, not prorated by day-of-month: an
// employee who joins on the 20th still gets that month's full share.
// PHASE4_MODELS.md only calls for day-of-joining proration at the "which
// months count at all" level, not sub-month precision. Generalized from a
// hardcoded Jan1–Dec31 window to an arbitrary cycleStart/cycleEnd so both
// 'calendar' and 'anniversary' cycle types (see utils/leaveCycle.js) share
// the exact same math — for a 'calendar' cycle, cycleStart/cycleEnd ARE
// Jan1/Dec31 of the year, so this is byte-identical to the pre-cycle-type
// behavior for every leave type that stays on the 'calendar' default.
function monthsAccruedInCycle({ cycleStart, cycleEnd, dateOfJoining, asOf = toBusinessLocal() }) {
  const cycleStartDate = new Date(`${cycleStart}T00:00:00`);
  const cycleEndDate = new Date(`${cycleEnd}T00:00:00`);
  const joinDate = dateOfJoining ? new Date(`${dateOfJoining}T00:00:00`) : null;
  const accrualStart = joinDate && joinDate > cycleStartDate ? joinDate : cycleStartDate;
  if (accrualStart > cycleEndDate) return 0;

  const windowEnd = asOf > cycleEndDate ? cycleEndDate : asOf;
  if (windowEnd < accrualStart) return 0;

  const months = (windowEnd.getFullYear() - accrualStart.getFullYear()) * 12
    + (windowEnd.getMonth() - accrualStart.getMonth()) + 1;
  return Math.max(0, Math.min(12, months));
}

// Roster is now the SOLE determinant of which LeavePolicy governs an
// employee — an employee with no Roster assigned has no applicable policy
// at all (no balance, no eligibility check, blank), and once assigned, only
// a policy explicitly linked to THAT Roster applies; a policy with zero
// Roster links is dormant (a catalog entry an admin hasn't attached to any
// Roster yet), not a "company-wide default" fallback anymore. Roster scoping
// is a many-to-many join (roster_group_leave_policies), constrained to at
// most one policy per (Roster, leaveType) — see
// leavePolicy.service.js::assertNoLeaveTypeConflict — so this lookup is a
// plain findOne once routed through the join table. Shared by
// getOrCreateBalance below and leaveRequest.service.js's applicable-after-
// days eligibility check, so both agree on which policy governs a given
// employee.
async function resolveLeavePolicy({ companyId, leaveTypeId, rosterGroupId, transaction }) {
  if (!rosterGroupId) return null;

  const link = await db.RosterGroupLeavePolicy.findOne({
    where: { rosterGroupId, leaveTypeId },
    include: [{ model: db.LeavePolicy, as: 'leavePolicy', where: { companyId } }],
    transaction,
  });
  return link ? link.leavePolicy : null;
}

// Lazily creates the employee's leave_balances row for (leaveTypeId, cycle)
// from the company's leave_policies row the first time it's needed, rather
// than requiring a separate backfill step per PHASE4_MODELS.md's "at policy
// assignment / start of year" trigger. For accrual=monthly this seeds
// whatever should already have accrued as of today; the monthly cron
// (src/jobs/leaveAccrual.job.js) tops it up going forward.
//
// Callers pass EITHER `dateStr` (the normal path — resolves which cycle that
// date falls into, via the leave type's own cycleType + the employee's
// dateOfJoining) OR `year` directly (the legacy/manual-override path used by
// adjustLeaveBalance, which predates cycle support and has no "as of which
// date" context to resolve one from). `leave_balances.year` is reused
// as-is as the cycle key for both cycle types — see utils/leaveCycle.js's
// header comment for why that's safe.
//
// 'monthly_reset' policies get their own row PER CALENDAR MONTH (the
// `month` column) instead of sharing the year's single row — critical for
// correctness: a leave applied for in one month but not approved until the
// next must deduct from the month it was actually FOR, not whatever month
// happens to be current when the approval finally lands (see the migration
// comment on 20260818160000 for the exact bug this closes). `dateStr`
// itself decides which month, not "today" — createLeaveRequest and
// approveLeaveRequest both pass the request's own fromDate, so both the
// eligibility check at submission and the deduction at approval always
// resolve the SAME month's row regardless of how long approval takes.
async function getOrCreateBalance({ employeeId, leaveTypeId, dateStr, year, transaction }) {
  const [leaveType, employee] = await Promise.all([
    db.LeaveType.findOne({ where: { id: leaveTypeId }, transaction }),
    db.Employee.findOne({ where: { id: employeeId }, transaction }),
  ]);

  let cycleStart = null;
  let cycleEnd = null;
  let cycleKey = year;
  if (cycleKey === undefined) {
    const cycle = resolveLeaveCycle({
      cycleType: leaveType ? leaveType.cycleType : 'calendar',
      dateOfJoining: employee ? employee.dateOfJoining : null,
      dateStr,
    });
    cycleKey = cycle.cycleKey;
    cycleStart = cycle.cycleStart;
    cycleEnd = cycle.cycleEnd;
  }

  // Needs the policy's accrual up front now (not just at creation time) to
  // know whether this lookup/creation is month-grain — resolved once and
  // reused below rather than a second query at creation.
  const policy = leaveType
    ? await resolveLeavePolicy({
        companyId: leaveType.companyId,
        leaveTypeId,
        rosterGroupId: employee ? employee.rosterGroupId : null,
        transaction,
      })
    : null;

  const isMonthlyReset = policy?.accrual === 'monthly_reset';
  const month = isMonthlyReset
    ? (year !== undefined ? null : new Date(`${dateStr}T00:00:00`).getMonth() + 1)
    : null;
  // An explicit `year` with no dateStr (the adjustLeaveBalance path) can't
  // resolve a real month — falls back to the year-grain row even for a
  // monthly_reset type in that legacy path, same as before this column
  // existed.

  const lookupWhere = { employeeId, leaveTypeId, year: cycleKey, month };

  let balance = await db.LeaveBalance.findOne({ where: lookupWhere, transaction });
  if (balance) return balance;

  let allotted = 0;
  if (policy) {
    if (policy.accrual === 'yearly') {
      allotted = Number(policy.annualQuota);
    } else if (policy.accrual === 'monthly_reset') {
      // Flat amount for THIS month's own row — no division/accumulation.
      allotted = Number(policy.annualQuota);
    } else if (cycleStart && cycleEnd) {
      const monthlyAmount = Number(policy.annualQuota) / 12;
      const months = monthsAccruedInCycle({
        cycleStart,
        cycleEnd,
        dateOfJoining: employee ? employee.dateOfJoining : null,
        asOf: dateStr ? new Date(`${dateStr}T00:00:00`) : undefined,
      });
      allotted = Math.round(monthlyAmount * months * 100) / 100;
    }
    // else: an explicit `year` was passed with no resolvable cycle window
    // (the adjustLeaveBalance path) — monthly accrual can't be computed
    // without one, so this seeds at 0; adjustLeaveBalance immediately
    // overwrites `allotted` with its own explicit value anyway.
  }

  // Carry-forward: if this leave type allows it, roll in whatever remained
  // unused at the end of the immediately-preceding PERIOD (capped at
  // maxCarryForwardDays, or uncapped if that's null). For year-grain rows,
  // "immediately preceding" is simply last cycle's row (cycleKey - 1, same
  // monotonic-integer trick as before). For a monthly_reset row, carry-
  // forward is deliberately a YEAR-boundary concept only — "use it or lose
  // it EACH MONTH" is the whole point of this accrual type, so month 2-12
  // never carries in from the month before; only month 1 checks December of
  // the previous year (a genuine cycle boundary, same as year-grain types).
  if (leaveType && leaveType.carryForward) {
    const prevWhere =
      month === null
        ? { employeeId, leaveTypeId, year: cycleKey - 1, month: null }
        : month === 1
          ? { employeeId, leaveTypeId, year: cycleKey - 1, month: 12 }
          : null;
    if (prevWhere) {
      const prevBalance = await db.LeaveBalance.findOne({ where: prevWhere, transaction });
      if (prevBalance && Number(prevBalance.balance) > 0) {
        const remainder = Number(prevBalance.balance);
        const cap = leaveType.maxCarryForwardDays;
        const carriedIn = cap != null ? Math.min(remainder, Number(cap)) : remainder;
        allotted = Math.round((allotted + carriedIn) * 100) / 100;
      }
    }
  }

  try {
    balance = await db.LeaveBalance.create(
      { employeeId, leaveTypeId, year: cycleKey, month, allotted, used: 0, balance: allotted },
      { transaction }
    );
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      // Race: created concurrently by another request.
      balance = await db.LeaveBalance.findOne({ where: lookupWhere, transaction });
    } else {
      throw err;
    }
  }
  return balance;
}

// A 'yearly'-accrual balance is otherwise never written until something
// actively triggers getOrCreateBalance (applying for leave, or the monthly
// cron — which skips 'yearly' policies entirely, see leaveAccrual.job.js) —
// so an employee whose Roster has a fresh Yearly Leave Policy would see a
// misleading "0 Total / 0 Remaining / Exhausted" on their own Leave Balance
// page until they happened to apply for leave once. Called only for an
// employee viewing their OWN balances (leaveBalance.routes.js's
// requireReadAccess own-scope path) — an admin browsing the company-wide
// list doesn't trigger this for every employee on every page load.
async function ensureBalancesForEmployee({ employeeId, year }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId } });
  if (!employee || !employee.rosterGroupId) return;

  const links = await db.RosterGroupLeavePolicy.findAll({
    where: { rosterGroupId: employee.rosterGroupId },
    attributes: ['leaveTypeId'],
  });
  if (links.length === 0) return;

  const currentYear = toBusinessLocal().getFullYear();
  // Viewing the current year: seed as of today (correct partial-year
  // proration for monthly accrual). Browsing a past year: seed as of that
  // year's Dec 31 (the full year had already elapsed, so accrual/carry-
  // forward resolve to their final values) — a future year is left alone,
  // nothing has accrued yet.
  const numericYear = year ? Number(year) : currentYear;
  if (numericYear > currentYear) return;
  const dateStr = numericYear === currentYear ? dateOnly(toBusinessLocal()) : `${numericYear}-12-31`;

  await Promise.all(
    links.map((link) =>
      getOrCreateBalance({ employeeId, leaveTypeId: link.leaveTypeId, dateStr }).catch(() => null)
    )
  );
}

// Attaches each row's currently-governing accrual ('yearly'/'monthly'/
// 'monthly_reset') so an employee viewing their own balance can tell WHY a
// number is what it is (e.g. "Casual Leave: 2 today, will keep growing
// monthly" vs "Annual Leave: full 25 given upfront") — resolved live from
// the employee's own Roster's LeavePolicy, same source getOrCreateBalance
// itself used to compute `allotted`. Not a snapshot on the balance row
// itself (unlike payroll's payslip_components) — if an admin changes a
// policy's accrual after the balance was created, this shows the CURRENT
// accrual, which only matters cosmetically since it's purely informational.
async function attachAccrualInfo(rows, employeeId) {
  const employee = await db.Employee.findOne({ where: { id: employeeId }, attributes: ['rosterGroupId'] });
  if (!employee || !employee.rosterGroupId) return rows.map((row) => ({ ...(row.toJSON ? row.toJSON() : row), accrual: null }));

  const links = await db.RosterGroupLeavePolicy.findAll({
    where: { rosterGroupId: employee.rosterGroupId },
    include: [{ model: db.LeavePolicy, as: 'leavePolicy', attributes: ['id', 'leaveTypeId', 'accrual'] }],
  });
  const accrualByTypeId = new Map(links.map((link) => [String(link.leaveTypeId), link.leavePolicy.accrual]));

  return rows.map((row) => {
    const plain = row.toJSON ? row.toJSON() : row;
    return { ...plain, accrual: accrualByTypeId.get(String(plain.leaveTypeId)) ?? null };
  });
}

async function listLeaveBalances({ companyId, employeeId, year, limit, offset }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (year) where.year = year;

  // A month-grain ('monthly_reset') leave type can have up to 12 rows for
  // the current year — only one of them ("this month's") is ever the
  // *current* balance. Year-grain rows (month IS NULL) always match
  // regardless. Only applied when browsing the current year (or no year
  // filter at all, which means "now") — a past-year browse intentionally
  // shows whatever rows exist for that year, month-grain or not.
  const currentYear = toBusinessLocal().getFullYear();
  if (!year || Number(year) === currentYear) {
    const currentMonth = toBusinessLocal().getMonth() + 1;
    where[Op.or] = [{ month: null }, { month: currentMonth }];
  }

  const { rows, count } = await db.LeaveBalance.findAndCountAll({
    where,
    limit,
    offset,
    order: [['year', 'DESC']],
    include: [
      { model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'employeeCode'] },
      { model: db.LeaveType, as: 'leaveType' },
    ],
  });
  return { rows, count };
}

// Manual correction (leave_balance:adjust) — sets allotted directly and
// recomputes balance from the existing used total.
async function adjustLeaveBalance({ companyId, employeeId, leaveTypeId, year, allotted }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const balance = await getOrCreateBalance({ employeeId, leaveTypeId, year });
  await balance.update({ allotted, balance: Number(allotted) - Number(balance.used) });
  return balance;
}

module.exports = {
  getOrCreateBalance,
  ensureBalancesForEmployee,
  attachAccrualInfo,
  listLeaveBalances,
  adjustLeaveBalance,
  monthsAccruedInCycle,
  resolveLeavePolicy,
};
