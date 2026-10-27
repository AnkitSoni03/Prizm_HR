'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { toBusinessLocal, dateOnly, addDays } = require('../../utils/dateRange');
const {
  effectiveCycleStartMonth,
  resolveLeavePeriod,
  prorateYearlyQuota,
  monthsAccruedInPeriod,
} = require('../../utils/leavePeriod');
const { computeWeekOffQuota } = require('../../utils/weekOffLeave');

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

function monthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}

// "As of which date" for the year-only callers (manual adjust, the year
// picker): today for the current year, otherwise that year's Dec 31.
function dateForYear(year) {
  const today = dateOnly(toBusinessLocal());
  return Number(year) === Number(today.slice(0, 4)) ? today : `${year}-12-31`;
}

// The employee's leave period for dateStr (utils/leavePeriod.js), resolved
// against their own / their company's "Yearly Roster Update" cycle.
async function resolvePeriodForEmployee(employee, dateStr, transaction) {
  const company = await db.Company.findOne({
    where: { id: employee.companyId },
    attributes: ['id', 'yearlyCycleStartMonth'],
    transaction,
  });
  const cycleStartMonth = effectiveCycleStartMonth({ employee, company });
  return resolveLeavePeriod({ employee, cycleStartMonth, dateStr });
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

// Pure calculation of a policy's own allotment (without any carried-in
// amount) for one period — shared with rosterTransfer.service.js's "don't
// carry forward, recompute per the new Roster" path. `policy: null` (no
// applicable LeavePolicy) always yields 0. `period` is a
// utils/leavePeriod.js::resolveLeavePeriod result:
//   - yearly: the quota prorated over the period (full for a whole cycle);
//   - monthly: quota/12 per month credited so far (dateStr = "as of");
//   - monthly_reset: the flat amount for that calendar month's own row.
// `leaveType` is only needed to detect the "Week Off Leaves" bucket.
function computeAllottedForPolicy({ policy, period, dateOfJoining, dateStr, leaveType, weekOffBasisDays }) {
  if (!policy) return 0;

  if (policy.accrual === 'monthly_reset') {
    // The "Week Off Leaves" bucket's quota isn't a flat configured amount —
    // it's that calendar month's basis-day count (see
    // weekOffLeave.service.js — the Shift's own weekOffLeaveBasisDays, e.g.
    // Sunday-only or Sat+Sun), prorated to only the basis-day occurrences
    // from the employee's own joining date onward if dateStr falls in their
    // joining month (a mid-month joiner isn't credited for days before they
    // existed). Every other monthly_reset type keeps the flat-amount
    // behavior below unchanged.
    if (leaveType && leaveType.isWeekOffBucket && dateStr) {
      const d = new Date(`${dateStr}T00:00:00`);
      return computeWeekOffQuota({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        dateOfJoining,
        basisDays: weekOffBasisDays || [0],
      });
    }
    // Flat amount for THIS month's own row — no division/accumulation.
    return Number(policy.annualQuota);
  }
  if (!period) return 0;
  if (policy.accrual === 'yearly') {
    return prorateYearlyQuota({ quota: policy.annualQuota, period });
  }
  const months = monthsAccruedInPeriod({ period, dateOfJoining, asOf: dateStr || dateOnly(toBusinessLocal()) });
  return round2((Number(policy.annualQuota) / 12) * months);
}

// How much of a previous row's remainder carries into the next period —
// capped at the leave type's maxCarryForwardDays (null = uncapped), zero
// when the type doesn't carry forward at all.
function carryAmount(leaveType, remainder) {
  if (!leaveType || !leaveType.carryForward || !(Number(remainder) > 0)) return 0;
  const cap = leaveType.maxCarryForwardDays;
  return round2(cap != null ? Math.min(Number(remainder), Number(cap)) : Number(remainder));
}

// The year-grain row a date falls in, if one exists: the latest-starting row
// whose period contains dateStr (an open probation row — period_end NULL —
// contains every later date).
async function findYearGrainRowForDate({ employeeId, leaveTypeId, dateStr, transaction }) {
  return db.LeaveBalance.findOne({
    where: {
      employeeId,
      leaveTypeId,
      month: null,
      periodStart: { [Op.lte]: dateStr },
      [Op.or]: [{ periodEnd: null }, { periodEnd: { [Op.gte]: dateStr } }],
    },
    order: [['periodStart', 'DESC']],
    transaction,
  });
}

// Lazily creates the employee's leave_balances row for (leaveTypeId, the
// period dateStr falls in) from their Roster's LeavePolicy the first time
// it's needed. There is no separate "renewal" step: the first touch of a new
// yearly cycle (or of the first post-probation period) creates its row and
// carries the previous period's remainder in (capped). For accrual=monthly
// this seeds whatever should already have accrued as of dateStr; the
// monthly cron (src/jobs/leaveAccrual.job.js) tops it up going forward.
//
// Callers pass `dateStr` (normal path) or, for the year-only manual adjust
// path, `year` (resolved as of today / that year's Dec 31).
//
// Periods (utils/leavePeriod.js): a Probation/Intern employee has ONE row per
// leave type from DOJ until they're confirmed — it does not renew on the
// yearly cycle date. After that, one row per yearly cycle (company default or
// the employee's own "Yearly Roster Update"), the first one starting on the
// confirmation day, prorated.
//
// 'monthly_reset' policies get their own row PER CALENDAR MONTH (the `month`
// column) — critical for correctness: a leave applied for in one month but
// not approved until the next must deduct from the month it was actually
// FOR (see the migration comment on 20260818160000). `dateStr` itself
// decides which month, not "today".
async function getOrCreateBalance({ employeeId, leaveTypeId, dateStr, year, transaction }) {
  const asOfStr = dateStr || dateForYear(year ?? toBusinessLocal().getFullYear());
  const [leaveType, employee] = await Promise.all([
    db.LeaveType.findOne({ where: { id: leaveTypeId }, transaction }),
    db.Employee.findOne({ where: { id: employeeId }, transaction }),
  ]);

  const policy =
    leaveType && employee
      ? await resolveLeavePolicy({
          companyId: leaveType.companyId,
          leaveTypeId,
          rosterGroupId: employee.rosterGroupId,
          transaction,
        })
      : null;
  const period = employee ? await resolvePeriodForEmployee(employee, asOfStr, transaction) : null;

  // Only resolved for the Week Off Leaves bucket — every other leave type
  // ignores weekOffBasisDays entirely.
  async function weekOffBasisDays() {
    if (!leaveType || !leaveType.isWeekOffBucket || !employee || !employee.rosterGroupId) return null;
    const rosterGroup = await db.RosterGroup.findOne({
      where: { id: employee.rosterGroupId },
      include: [{ model: db.Shift, as: 'shifts', through: { attributes: [] } }],
      transaction,
    });
    return rosterGroup?.shifts?.[0]?.weekOffLeaveBasisDays ?? null;
  }

  async function createRow(values, lookupWhere) {
    try {
      return await db.LeaveBalance.create({ employeeId, leaveTypeId, used: 0, ...values }, { transaction });
    } catch (err) {
      if (err.name !== 'SequelizeUniqueConstraintError') throw err;
      // Race: created concurrently by another request.
      return db.LeaveBalance.findOne({ where: lookupWhere, transaction });
    }
  }

  // ── Month-grain (monthly_reset) ──────────────────────────────────────
  if (policy?.accrual === 'monthly_reset') {
    const [y, m] = asOfStr.split('-').map(Number);
    const lookupWhere = { employeeId, leaveTypeId, year: y, month: m };
    const existing = await db.LeaveBalance.findOne({ where: lookupWhere, transaction });
    if (existing) return existing;

    let allotted = computeAllottedForPolicy({
      policy,
      period,
      dateOfJoining: employee.dateOfJoining,
      dateStr: asOfStr,
      leaveType,
      weekOffBasisDays: await weekOffBasisDays(),
    });
    // "Use it or lose it EACH MONTH" is the point of this accrual type — only
    // the first month of a yearly cycle carries the previous month's
    // remainder in (never during a probation period).
    let carried = 0;
    if (leaveType.carryForward && period?.kind === 'cycle' && m === period.cycleStartMonth) {
      const prev = await db.LeaveBalance.findOne({
        where: { employeeId, leaveTypeId, year: m === 1 ? y - 1 : y, month: m === 1 ? 12 : m - 1 },
        transaction,
      });
      carried = carryAmount(leaveType, prev?.balance);
      allotted = round2(allotted + carried);
    }
    const range = monthRange(y, m);
    return createRow(
      { year: y, month: m, periodStart: range.start, periodEnd: range.end, allotted, carriedForward: carried, balance: allotted },
      lookupWhere
    );
  }

  // ── Year-grain (yearly / monthly, or no policy) ──────────────────────
  const containing = await findYearGrainRowForDate({ employeeId, leaveTypeId, dateStr: asOfStr, transaction });
  // An open probation row (period_end NULL) contains every later date —
  // but once the employee is confirmed it must give way to the new period.
  const staleOpenRow =
    containing && containing.periodEnd === null && period?.kind === 'cycle' && containing.periodStart < period.periodStart;
  if (containing && !staleOpenRow) return containing;
  if (!period) return containing;

  const lookupWhere = { employeeId, leaveTypeId, month: null, periodStart: period.periodStart };
  const sameStart = await db.LeaveBalance.findOne({ where: lookupWhere, transaction });
  if (sameStart) return sameStart;

  let allotted = computeAllottedForPolicy({
    policy,
    period,
    dateOfJoining: employee.dateOfJoining,
    dateStr: asOfStr,
    leaveType,
    weekOffBasisDays: await weekOffBasisDays(),
  });

  // The period right before this one: close it if it was left open (a
  // probation period ends the day before this one starts), and — when the
  // leave type carries forward — roll its remainder in, capped. Only a
  // period that actually runs up to this one counts (no carry across a gap),
  // and nothing carries INTO a probation period.
  let carried = 0;
  const prev = await db.LeaveBalance.findOne({
    where: { employeeId, leaveTypeId, month: null, periodStart: { [Op.lt]: period.periodStart } },
    order: [['periodStart', 'DESC']],
    transaction,
  });
  if (prev) {
    const dayBefore = addDays(period.periodStart, -1);
    if (prev.periodEnd === null || prev.periodEnd > dayBefore) {
      await prev.update({ periodEnd: dayBefore }, { transaction });
    }
    if (period.kind === 'cycle' && prev.periodEnd >= dayBefore) {
      carried = carryAmount(leaveType, prev.balance);
      allotted = round2(allotted + carried);
    }
  }

  return createRow(
    {
      year: Number(period.periodStart.slice(0, 4)),
      month: null,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      allotted,
      carriedForward: carried,
      balance: allotted,
    },
    lookupWhere
  );
}

// Monthly accrual top-up for one year-grain row (jobs/leaveAccrual.job.js):
// recomputes what the policy has accrued in the row's period as of
// asOfStr, keeping the carried-in amount on top. Idempotent.
async function refreshMonthlyAccrual({ balance, policy, employee, asOfStr }) {
  const period = await resolvePeriodForEmployee(employee, asOfStr);
  // The row decides the window; the resolved period supplies its cycle.
  const rowPeriod = { ...period, periodStart: balance.periodStart, periodEnd: balance.periodEnd };
  const accrued = computeAllottedForPolicy({ policy, period: rowPeriod, dateOfJoining: employee.dateOfJoining, dateStr: asOfStr });
  const allotted = round2(accrued + Number(balance.carriedForward || 0));
  if (Number(balance.allotted) !== allotted) {
    await balance.update({ allotted, balance: round2(allotted - Number(balance.used)) });
  }
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
// Mirrors leaveType.service.js::listLeaveTypes — 'all' is open to everyone;
// a restricted type needs an exact match, so an employee with gender unset
// sees no restricted type rather than a guessed one.
function isGenderEligible(leaveType, employeeGender) {
  if (!leaveType || !leaveType.applicableGender || leaveType.applicableGender === 'all') return true;
  return leaveType.applicableGender === employeeGender;
}

// Admin-side guard: rejects assigning a gender-restricted leave type to an
// employee it doesn't apply to.
function assertGenderEligible(leaveType, employee) {
  if (!isGenderEligible(leaveType, employee.gender)) {
    throw new HttpError(
      422,
      employee.gender
        ? `${leaveType.name} is not applicable for this employee's gender`
        : `${leaveType.name} is restricted by gender — set this employee's gender first`
    );
  }
}

async function ensureBalancesForEmployee({ employeeId, year }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId } });
  if (!employee || !employee.rosterGroupId) return;

  const allLinks = await db.RosterGroupLeavePolicy.findAll({
    where: { rosterGroupId: employee.rosterGroupId },
    attributes: ['leaveTypeId'],
    include: [{ model: db.LeaveType, as: 'leaveType', attributes: ['id', 'applicableGender', 'deductFromLeaveTypeId'] }],
  });
  // Never seed a balance for a gender-restricted type this employee isn't
  // eligible for (e.g. Maternity Leave for a male employee), nor for a linked
  // type (e.g. Half Day) — it has no balance of its own, its uses are charged
  // to the source type's row.
  const links = allLinks.filter(
    (link) => isGenderEligible(link.leaveType, employee.gender) && !(link.leaveType && link.leaveType.deductFromLeaveTypeId)
  );
  if (links.length === 0) return;

  const currentYear = toBusinessLocal().getFullYear();
  // Viewing the current year: seed as of today (correct partial-period
  // proration for monthly accrual, and the yearly renewal / post-probation
  // period is created the first time it's looked at). Browsing a past year:
  // seed as of that year's Dec 31 — a future year is left alone.
  const numericYear = year ? Number(year) : currentYear;
  if (numericYear > currentYear) return;
  const dateStr = dateForYear(numericYear);

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
// itself (unlike payroll's monthly snapshot) — if an admin changes a
// policy's accrual after the balance was created, this shows the CURRENT
// accrual, which only matters cosmetically since it's purely informational.
//
// ALSO filters out any row for a leave type the employee's CURRENT Roster
// no longer governs (or every row, if they have no Roster at all) — the
// own-scope enforcement of "Roster is the sole determinant of which
// LeavePolicy governs an employee" (CLAUDE.md). rosterTransfer.service.js's
// changeEmployeeRoster is the write-side half of this guarantee (it resets
// or relocates a balance the moment a Roster actually changes); this is the
// read-side backstop so a stale row from ANY cause — a roster change from
// before that logic existed, a manual leave_balance:adjust correction, a
// future bug — can never be shown to the employee as real, usable balance.
// The company-wide admin list (listLeaveBalances, no attachAccrualInfo call)
// is deliberately NOT filtered this way — an admin needs to see a stray
// balance to clean it up, not have it hidden from them too.
// The date range a balance row covers — its own period (an open probation
// period runs up to today).
function periodForBalanceRow(row) {
  return { start: row.periodStart, end: row.periodEnd || dateOnly(toBusinessLocal()) };
}

async function attachAccrualInfo(rows, employeeId) {
  const employee = await db.Employee.findOne({
    where: { id: employeeId },
    attributes: ['rosterGroupId', 'gender', 'dateOfJoining'],
  });
  if (!employee || !employee.rosterGroupId) return [];

  const links = await db.RosterGroupLeavePolicy.findAll({
    where: { rosterGroupId: employee.rosterGroupId },
    include: [
      { model: db.LeavePolicy, as: 'leavePolicy', attributes: ['id', 'leaveTypeId', 'accrual', 'isUnlimited'] },
      { model: db.LeaveType, as: 'leaveType' },
    ],
  });
  const policyByTypeId = new Map(links.map((link) => [String(link.leaveTypeId), link.leavePolicy]));
  // A linked type's balance is always synthesized below from its source — a
  // stored row for it (left over from before linked types were skipped at
  // seeding) is a stale 0/0/0 that would shadow the real figure.
  const linkedTypeIds = new Set(
    links.filter((link) => link.leaveType && link.leaveType.deductFromLeaveTypeId).map((link) => String(link.leaveTypeId))
  );

  // Also hides a gender-restricted type the employee isn't eligible for
  // (e.g. Paternity Leave for a female employee) — same rule
  // leaveType.service.js::listLeaveTypes applies to the ESS type list, so the
  // Dashboard's balance widget and the Leave Balance page always agree.
  const result = rows
    .filter((row) => policyByTypeId.has(String(row.leaveTypeId)))
    .filter((row) => !linkedTypeIds.has(String(row.leaveTypeId)))
    .filter((row) => isGenderEligible(row.leaveType, employee.gender))
    .map((row) => {
      const plain = row.toJSON ? row.toJSON() : row;
      const policy = policyByTypeId.get(String(plain.leaveTypeId));
      return { ...plain, accrual: policy?.accrual ?? null, isUnlimited: !!policy?.isUnlimited };
    });

  // Linked types (e.g. Half Day deducting 0.5 from Annual Leave) have no row
  // of their own — synthesize one per source row, in USES of the linked type:
  //   remaining = what the source balance still allows (6 days at 0.5 = 12),
  //   used      = how many of THIS type were actually taken in that period
  //               (approved requests) — not the source's own usage,
  //   total     = used + remaining.
  // So Annual 6 left -> Half Day 12/0/12; after one Annual day -> 10/0/10;
  // after one Half Day instead -> Annual 5.5, Half Day 10/1/9.
  // Unlimited follows the source's own policy.
  for (const link of links) {
    const linkedType = link.leaveType;
    if (!linkedType || !linkedType.deductFromLeaveTypeId) continue;
    if (!isGenderEligible(linkedType, employee.gender)) continue;
    const perUse = Number(linkedType.deductionPerUse) || 1;
    const sources = result.filter((r) => String(r.leaveTypeId) === String(linkedType.deductFromLeaveTypeId));
    for (const source of sources) {
      const toUses = (days) => Math.round((Number(days) / perUse) * 100) / 100;
      const period = periodForBalanceRow(source);
      const usedDays = await db.LeaveRequest.sum('days', {
        where: {
          employeeId,
          leaveTypeId: linkedType.id,
          status: 'approved',
          fromDate: { [Op.between]: [period.start, period.end] },
        },
      });
      const used = toUses(usedDays || 0);
      const remaining = Math.max(0, toUses(source.balance));
      result.push({
        id: `linked-${linkedType.id}-${source.id}`,
        employeeId: source.employeeId,
        leaveTypeId: linkedType.id,
        year: source.year,
        month: source.month,
        allotted: Math.round((used + remaining) * 100) / 100,
        used,
        balance: remaining,
        leaveType: linkedType.toJSON ? linkedType.toJSON() : linkedType,
        accrual: source.accrual,
        isUnlimited: source.isUnlimited,
        // Lets the UI say "Uses Annual Leave balance (0.5 day each)".
        linkedTo: { leaveTypeId: source.leaveTypeId, name: source.leaveType?.name ?? null, deductionPerUse: perUse },
      });
    }
  }
  return result;
}

async function listLeaveBalances({ companyId, employeeId, year, limit, offset }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;

  // Current year (or no year = "now"): each employee's CURRENT row per leave
  // type — the year-grain row whose period contains today (a still-running
  // probation period always does) and this month's month-grain row. Any
  // other year: every row whose period overlaps that year.
  const today = dateOnly(toBusinessLocal());
  const currentYear = Number(today.slice(0, 4));
  const numericYear = year ? Number(year) : currentYear;
  if (numericYear === currentYear) {
    where[Op.or] = [
      {
        month: null,
        periodStart: { [Op.lte]: today },
        [Op.or]: [{ periodEnd: null }, { periodEnd: { [Op.gte]: today } }],
      },
      { year: currentYear, month: toBusinessLocal().getMonth() + 1 },
    ];
  } else {
    where[Op.or] = [
      {
        month: null,
        periodStart: { [Op.lte]: `${numericYear}-12-31` },
        [Op.or]: [{ periodEnd: null }, { periodEnd: { [Op.gte]: `${numericYear}-01-01` } }],
      },
      { year: numericYear, month: { [Op.not]: null } },
    ];
  }

  // Hide balances for a gender-restricted leave type the employee isn't
  // eligible for (e.g. stray Maternity rows on a male employee) — done in SQL
  // so pagination/count stay correct on the company-wide admin list.
  // Both columns are distinct Postgres enums, hence the ::text casts.
  const genderEligible = {
    [Op.or]: [
      { '$leaveType.applicable_gender$': 'all' },
      db.sequelize.where(
        db.sequelize.cast(db.sequelize.col('leaveType.applicable_gender'), 'text'),
        '=',
        db.sequelize.cast(db.sequelize.col('employee.gender'), 'text')
      ),
    ],
  };
  where[Op.and] = [...(where[Op.and] || []), genderEligible];

  return db.LeaveBalance.findAndCountAll({
    where,
    limit,
    offset,
    order: [['periodStart', 'DESC'], ['month', 'DESC']],
    include: [
      { model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'employeeCode', 'dateOfJoining'] },
      { model: db.LeaveType, as: 'leaveType' },
    ],
  });
}

// Manual correction (leave_balance:adjust) — sets allotted directly and
// recomputes balance from the existing used total.
async function adjustLeaveBalance({ companyId, employeeId, leaveTypeId, year, allotted }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId, companyId } });
  if (!leaveType) throw new HttpError(404, 'Leave type not found');
  assertGenderEligible(leaveType, employee);

  const balance = await getOrCreateBalance({ employeeId, leaveTypeId, year });
  await balance.update({ allotted, balance: Number(allotted) - Number(balance.used) });
  return balance;
}

// Bulk manual correction, from the Employee Detail Modal's "Leaves" tab —
// each entry targets the ALREADY-DISPLAYED row directly by its own
// (leaveTypeId, year, month), unlike adjustLeaveBalance above (which routes
// through getOrCreateBalance's `year`-only path — that path always resolves
// `month: null`, see getOrCreateBalance's header comment, so it would
// silently create a phantom year-grain row instead of touching a
// 'monthly_reset' leave type's real month-grain row). `used` is optional —
// omitting it (or sending the row's current value) leaves it untouched, so a
// caller that only ever edits `allotted` behaves exactly as before. Returns
// only the entries where `allotted` and/or `used` actually changed, so the
// caller can send a single notification listing just what changed rather
// than one per untouched row.
async function bulkAdjustLeaveBalances({ companyId, employeeId, adjustments }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const changes = [];
  for (const { id, leaveTypeId, year, month, allotted, used } of adjustments) {
    const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId, companyId } });
    if (!leaveType) throw new HttpError(404, 'Leave type not found');
    assertGenderEligible(leaveType, employee);

    // The displayed row itself (by id) — a year can now hold two periods for
    // one leave type (probation, then the post-confirmation period).
    // Without an id: that month's row, or the period current as of the year.
    let balance;
    if (id) {
      balance = await db.LeaveBalance.findOne({ where: { id, employeeId, leaveTypeId } });
      if (!balance) throw new HttpError(404, 'Leave balance not found');
    } else if (month) {
      const range = monthRange(Number(year), Number(month));
      [balance] = await db.LeaveBalance.findOrCreate({
        where: { employeeId, leaveTypeId, year, month },
        defaults: { employeeId, leaveTypeId, year, month, periodStart: range.start, periodEnd: range.end, allotted: 0, used: 0, balance: 0 },
      });
    } else {
      balance = await getOrCreateBalance({ employeeId, leaveTypeId, dateStr: dateForYear(year) });
    }

    const previousAllotted = Number(balance.allotted);
    const previousUsed = Number(balance.used);
    const nextAllotted = allotted !== undefined ? Number(allotted) : previousAllotted;
    const nextUsed = used !== undefined ? Number(used) : previousUsed;

    if (previousAllotted !== nextAllotted || previousUsed !== nextUsed) {
      await balance.update({ allotted: nextAllotted, used: nextUsed, balance: nextAllotted - nextUsed });
      changes.push({ leaveTypeName: leaveType.name, previousAllotted, newAllotted: nextAllotted, previousUsed, newUsed: nextUsed });
    }
  }

  return { employee, changes };
}

module.exports = {
  getOrCreateBalance,
  ensureBalancesForEmployee,
  attachAccrualInfo,
  listLeaveBalances,
  adjustLeaveBalance,
  bulkAdjustLeaveBalances,
  resolveLeavePolicy,
  resolvePeriodForEmployee,
  computeAllottedForPolicy,
  carryAmount,
  refreshMonthlyAccrual,
};
