'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { toBusinessLocal, dateOnly } = require('../../utils/dateRange');
const { resolveLeaveCycle } = require('../../utils/leaveCycle');
const { computeWeekOffQuota } = require('../../utils/weekOffLeave');

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

// Pure calculation, extracted so rosterTransfer.service.js can compute what
// a leave type's FRESH allotment would be under a given policy (the "No,
// don't carry forward — recompute per the new Roster" path) without
// duplicating the yearly/monthly/monthly_reset branching. `policy: null`
// (no applicable LeavePolicy) always yields 0. `leaveType` is optional (only
// needed to detect the auto-provisioned "Week Off Leaves" bucket below) —
// every existing caller that omits it keeps the exact prior behavior.
function computeAllottedForPolicy({ policy, cycleStart, cycleEnd, dateOfJoining, dateStr, leaveType, weekOffBasisDays }) {
  if (!policy) return 0;

  if (policy.accrual === 'yearly') {
    return Number(policy.annualQuota);
  }
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
  if (cycleStart && cycleEnd) {
    const monthlyAmount = Number(policy.annualQuota) / 12;
    const months = monthsAccruedInCycle({
      cycleStart,
      cycleEnd,
      dateOfJoining,
      asOf: dateStr ? new Date(`${dateStr}T00:00:00`) : undefined,
    });
    return Math.round(monthlyAmount * months * 100) / 100;
  }
  // An explicit `year` was passed with no resolvable cycle window (the
  // adjustLeaveBalance path) — monthly accrual can't be computed without
  // one, so this seeds at 0; adjustLeaveBalance immediately overwrites
  // `allotted` with its own explicit value anyway.
  return 0;
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
      customCycleStartMonth: leaveType ? leaveType.customCycleStartMonth : null,
      customCycleStartDay: leaveType ? leaveType.customCycleStartDay : null,
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

  // Only resolved for the Week Off Leaves bucket — every other leave type
  // ignores weekOffBasisDays entirely, so this extra query is skipped for
  // the overwhelmingly common case.
  let weekOffBasisDays = null;
  if (leaveType && leaveType.isWeekOffBucket && employee && employee.rosterGroupId) {
    const rosterGroup = await db.RosterGroup.findOne({
      where: { id: employee.rosterGroupId },
      include: [{ model: db.Shift, as: 'shifts', through: { attributes: [] } }],
      transaction,
    });
    weekOffBasisDays = rosterGroup?.shifts?.[0]?.weekOffLeaveBasisDays ?? null;
  }

  let allotted = computeAllottedForPolicy({
    policy,
    cycleStart,
    cycleEnd,
    dateOfJoining: employee ? employee.dateOfJoining : null,
    dateStr,
    leaveType,
    weekOffBasisDays,
  });

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
// The date range a balance row covers: one calendar month for a
// 'monthly_reset' row, otherwise the leave type's cycle whose key is
// row.year (see utils/leaveCycle.js — calendar year, custom cycle start year,
// or employment-year number for 'anniversary').
function periodForBalanceRow(row, leaveType, dateOfJoining) {
  const year = Number(row.year);
  const pad = (n) => String(n).padStart(2, '0');
  if (row.month) {
    const lastDay = new Date(year, Number(row.month), 0).getDate();
    return { start: `${year}-${pad(row.month)}-01`, end: `${year}-${pad(row.month)}-${pad(lastDay)}` };
  }
  const cycleType = leaveType?.cycleType || 'calendar';
  let anchor = `${year}-01-01`;
  if (cycleType === 'custom' && leaveType.customCycleStartMonth && leaveType.customCycleStartDay) {
    anchor = `${year}-${pad(leaveType.customCycleStartMonth)}-${pad(leaveType.customCycleStartDay)}`;
  } else if (cycleType === 'anniversary' && dateOfJoining) {
    const join = new Date(`${dateOfJoining}T00:00:00`);
    anchor = `${join.getFullYear() + year - 1}-${pad(join.getMonth() + 1)}-${pad(join.getDate())}`;
  }
  const { cycleStart, cycleEnd } = resolveLeaveCycle({
    cycleType,
    dateOfJoining,
    dateStr: anchor,
    customCycleStartMonth: leaveType?.customCycleStartMonth,
    customCycleStartDay: leaveType?.customCycleStartDay,
  });
  return { start: cycleStart, end: cycleEnd };
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

  // Also hides a gender-restricted type the employee isn't eligible for
  // (e.g. Paternity Leave for a female employee) — same rule
  // leaveType.service.js::listLeaveTypes applies to the ESS type list, so the
  // Dashboard's balance widget and the Leave Balance page always agree.
  const result = rows
    .filter((row) => policyByTypeId.has(String(row.leaveTypeId)))
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
      const period = periodForBalanceRow(source, source.leaveType, employee.dateOfJoining);
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

  // For an 'anniversary'-cycle leave type, `leave_balances.year` holds an
  // employment-cycle NUMBER (1, 2, 3...), not a calendar year (see
  // utils/leaveCycle.js's header comment) — a literal `year` filter (what
  // every caller of this function actually has: the ESS "My Leave Balance"
  // page's Year picker, or an admin browsing a calendar year) can never
  // match those rows. Only resolvable per-row (each leave type's own
  // cycleType + the employee's own dateOfJoining), so this is only done for
  // a single-employee lookup (own-scope read, or an admin viewing one
  // employee) — cheap there, and not worth the extra per-row work across an
  // unbounded company-wide list.
  const resolveCycleKeysPerRow = Boolean(year) && Boolean(employeeId);
  if (year && !resolveCycleKeysPerRow) where.year = year;

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

  const { rows, count } = await db.LeaveBalance.findAndCountAll({
    where,
    limit: resolveCycleKeysPerRow ? undefined : limit,
    offset: resolveCycleKeysPerRow ? undefined : offset,
    order: [['year', 'DESC']],
    include: [
      { model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'employeeCode', 'dateOfJoining'] },
      { model: db.LeaveType, as: 'leaveType' },
    ],
  });

  if (!resolveCycleKeysPerRow) return { rows, count };

  const numericYear = Number(year);
  // Same "current year -> as of today, past year -> as of that Dec 31"
  // resolution ensureBalancesForEmployee already uses to CREATE these rows —
  // mirroring it here is what guarantees a row this function just seeded is
  // always found again by this same filter.
  const dateStr = numericYear >= currentYear ? dateOnly(toBusinessLocal()) : `${numericYear}-12-31`;
  const filteredRows = rows.filter((row) => {
    const leaveType = row.leaveType;
    if (!leaveType || leaveType.cycleType !== 'anniversary') {
      return Number(row.year) === numericYear;
    }
    const { cycleKey } = resolveLeaveCycle({
      cycleType: 'anniversary',
      dateOfJoining: row.employee ? row.employee.dateOfJoining : null,
      dateStr,
    });
    return Number(row.year) === cycleKey;
  });
  return { rows: filteredRows, count: filteredRows.length };
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
  for (const { leaveTypeId, year, month, allotted, used } of adjustments) {
    const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId, companyId } });
    if (!leaveType) throw new HttpError(404, 'Leave type not found');
    assertGenderEligible(leaveType, employee);

    const monthKey = month ?? null;
    const [balance] = await db.LeaveBalance.findOrCreate({
      where: { employeeId, leaveTypeId, year, month: monthKey },
      defaults: { employeeId, leaveTypeId, year, month: monthKey, allotted: 0, used: 0, balance: 0 },
    });

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
  monthsAccruedInCycle,
  resolveLeavePolicy,
  computeAllottedForPolicy,
};
