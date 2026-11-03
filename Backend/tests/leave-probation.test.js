'use strict';

// Leave + probation rules (2026-11-03 changes). Runs fully offline against
// tests/fakeDb.js — no real database is ever touched.
// Run: cd Backend && node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { reset } = require('./fakeDb');

const { computeProbationEndDate, probationAlertFor } = require('../src/utils/probation');
const lp = require('../src/utils/leavePeriod');
const svc = require('../src/modules/leave/leaveBalance.service');
const { runLeaveAccrual } = require('../src/jobs/leaveAccrual.job');

const day = (s) => new Date(`${s}T00:00:00`);
const num = (v) => Number(v);

// ── Fixture ────────────────────────────────────────────────────────────
// Company 1 (Jan–Dec), Roster 1, Casual Leave 24/yr credited monthly.
function setup({ accrual = 'monthly', quota = 24, carryForward = false, maxCarry = null, isPaid = true, partialYearMode = null } = {}) {
  const t = reset();
  t.Company.insert({ id: 1, yearlyCycleStartMonth: 1 });
  const type = t.LeaveType.insert({ companyId: 1, name: 'Casual Leave', isPaid, carryForward, maxCarryForwardDays: maxCarry });
  const policy = t.LeavePolicy.insert({ companyId: 1, leaveTypeId: type.id, accrual, annualQuota: quota, partialYearMode });
  t.RosterGroupLeavePolicy.insert({ rosterGroupId: 1, leavePolicyId: policy.id, leaveTypeId: type.id });
  const addEmployee = (vals) =>
    t.Employee.insert({ companyId: 1, rosterGroupId: 1, employmentType: 'full_time', ...vals });
  return { t, type, policy, addEmployee };
}

// ── 1. Probation end date ──────────────────────────────────────────────
const END_CASES = [
  ['joined 10 Mar (≤15) → 31 Aug', '2026-03-10', 6, 'months', '2026-08-31'],
  ['joined 15 Mar (=15) → 31 Aug', '2026-03-15', 6, 'months', '2026-08-31'],
  ['joined 16 Mar (>15) → 30 Sep', '2026-03-16', 6, 'months', '2026-09-30'],
  ['joined 20 Mar → 30 Sep', '2026-03-20', 6, 'months', '2026-09-30'],
  ['joined 1 Mar → 31 Aug', '2026-03-01', 6, 'months', '2026-08-31'],
  ['joined 31 Mar → 30 Sep', '2026-03-31', 6, 'months', '2026-09-30'],
  ['year rollover: 20 Dec + 6 → 30 Jun', '2026-12-20', 6, 'months', '2027-06-30'],
  ['into February: 10 Dec + 3 → 28 Feb', '2026-12-10', 3, 'months', '2027-02-28'],
  ['leap year: 31 Aug 2027 + 6 → 29 Feb 2028', '2027-08-31', 6, 'months', '2028-02-29'],
  ['1 month, 10 Mar → 31 Mar', '2026-03-10', 1, 'months', '2026-03-31'],
  ['1 month, 16 Mar → 30 Apr', '2026-03-16', 1, 'months', '2026-04-30'],
  ['12 months, 5 Jan → 31 Dec', '2026-01-05', 12, 'months', '2026-12-31'],
  ['days unit unchanged: 10 Mar + 180 days → 5 Sep', '2026-03-10', 180, 'days', '2026-09-05'],
  ['days unit is the default', '2026-03-10', 30, undefined, '2026-04-08'],
];

test('probation end date (backend)', async (t) => {
  for (const [name, doj, n, unit, want] of END_CASES) {
    await t.test(name, () => {
      assert.equal(computeProbationEndDate({ dateOfJoining: doj, probationPeriodDays: n, probationPeriodUnit: unit }), want);
    });
  }
  await t.test('missing inputs → null', () => {
    assert.equal(computeProbationEndDate({ dateOfJoining: null, probationPeriodDays: 6, probationPeriodUnit: 'months' }), null);
    assert.equal(computeProbationEndDate({ dateOfJoining: '2026-03-10', probationPeriodDays: null, probationPeriodUnit: 'months' }), null);
  });
});

test('probation end date (frontend matches backend)', async (t) => {
  const fe = await import(pathToFileURL(path.join(__dirname, '../../Frontend/src/utils/probation.ts')).href);
  for (const [name, doj, n, unit, want] of END_CASES) {
    await t.test(name, () => assert.equal(fe.probationEndDate(doj, n, unit), want));
  }
  await t.test('invalid inputs → null', () => {
    assert.equal(fe.probationEndDate('', 6, 'months'), null);
    assert.equal(fe.probationEndDate('2026-03-10', 0, 'months'), null);
    assert.equal(fe.probationEndDate('not-a-date', 6, 'months'), null);
  });
});

test('probation reminder follows the new end date', () => {
  const emp = { employmentType: 'probation', dateOfJoining: '2026-03-10', probationPeriodDays: 6, probationPeriodUnit: 'months' };
  assert.equal(probationAlertFor(emp, day('2026-08-20')), null, '11 days before: no reminder yet');
  assert.deepEqual(probationAlertFor(emp, day('2026-08-29')), { endDate: '2026-08-31', daysRemaining: 2 });
  assert.equal(probationAlertFor({ ...emp, employmentType: 'full_time' }, day('2026-08-29')), null);
});

// ── 2. Leave period rules (pure) ───────────────────────────────────────
function probationPeriod(doj, asOf, unit = 'months', n = 6) {
  const employee = { dateOfJoining: doj, probationPeriodDays: n, probationPeriodUnit: unit, employmentType: 'probation' };
  return lp.resolveLeavePeriod({ employee, cycleStartMonth: 1, dateStr: asOf });
}

test('leave months: probation joined after the 15th starts next month', async (t) => {
  const months = (doj, asOf) => lp.monthsAccruedInPeriod({ period: probationPeriod(doj, asOf), dateOfJoining: doj, asOf });
  await t.test('20 Mar, as of 25 Mar → 0', () => assert.equal(months('2026-03-20', '2026-03-25'), 0));
  await t.test('20 Mar, as of 1 Apr → 1', () => assert.equal(months('2026-03-20', '2026-04-01'), 1));
  await t.test('20 Mar, as of 30 Sep → 6', () => assert.equal(months('2026-03-20', '2026-09-30'), 6));
  await t.test('10 Mar (≤15), as of 25 Mar → 1', () => assert.equal(months('2026-03-10', '2026-03-25'), 1));
  await t.test('15 Mar (=15), as of 25 Mar → 1', () => assert.equal(months('2026-03-15', '2026-03-25'), 1));
  await t.test('yearly 12, joined 20 Mar → 6 (Apr–Sep)', () =>
    assert.equal(lp.prorateYearlyQuota({ quota: 12, period: probationPeriod('2026-03-20', '2026-04-01') }), 6));
  await t.test('yearly 12, joined 10 Mar → 6 (Mar–Aug)', () =>
    assert.equal(lp.prorateYearlyQuota({ quota: 12, period: probationPeriod('2026-03-10', '2026-04-01') }), 6));
});

test('leave months: Full-time joiner after the 15th still gets the joining month', () => {
  const employee = { dateOfJoining: '2026-03-20', employmentType: 'full_time' };
  const period = lp.resolveLeavePeriod({ employee, cycleStartMonth: 1, dateStr: '2026-03-25' });
  assert.equal(lp.monthsAccruedInPeriod({ period, dateOfJoining: '2026-03-20', asOf: '2026-03-25' }), 1);
});

test('leave months: never counted before the joining date', async (t) => {
  const stale = { kind: 'cycle', periodStart: '2026-01-01', periodEnd: '2026-12-31' };
  await t.test('row saved from 1 Jan, joined 12 Sep → Sep–Dec = 4', () =>
    assert.equal(lp.monthsAccruedInPeriod({ period: stale, dateOfJoining: '2026-09-12', asOf: '2026-12-01' }), 4));
  await t.test('as of before joining → 0', () =>
    assert.equal(lp.monthsAccruedInPeriod({ period: stale, dateOfJoining: '2026-09-12', asOf: '2026-08-15' }), 0));
  await t.test('no joining date → counts from the row start', () =>
    assert.equal(lp.monthsAccruedInPeriod({ period: stale, dateOfJoining: null, asOf: '2026-03-15' }), 3));
});

// ── 3. carryAmount ─────────────────────────────────────────────────────
test('carry forward amounts', async (t) => {
  const c = svc.carryAmount;
  await t.test('negative paid is carried in full', () => assert.equal(c({ isPaid: true, carryForward: false }, -4, { carryNegative: true }), -4));
  await t.test('negative ignores the cap', () => assert.equal(c({ isPaid: true, carryForward: true, maxCarryForwardDays: 1 }, -4, { carryNegative: true }), -4));
  await t.test('negative unpaid is not carried', () => assert.equal(c({ isPaid: false, carryForward: true }, -3, { carryNegative: true }), 0));
  await t.test('negative without the flag is not carried', () => assert.equal(c({ isPaid: true, carryForward: true }, -2), 0));
  await t.test('positive capped', () => assert.equal(c({ isPaid: true, carryForward: true, maxCarryForwardDays: 5 }, 8, { carryNegative: true }), 5));
  await t.test('positive, carry forward off → 0', () => assert.equal(c({ isPaid: true, carryForward: false }, 8, { carryNegative: true }), 0));
  await t.test('zero → 0', () => assert.equal(c({ isPaid: true, carryForward: true }, 0, { carryNegative: true }), 0));
  await t.test('decimal string from DB', () => assert.equal(c({ isPaid: true, carryForward: false }, '-1.50', { carryNegative: true }), -1.5));
});

// ── 4. Creating a balance ──────────────────────────────────────────────
test('new balance rows', async (t) => {
  await t.test('Full-time 12 Sep, monthly 24, as of 3 Nov → 6, credit tracked', async () => {
    const { type, addEmployee } = setup();
    const e = addEmployee({ dateOfJoining: '2026-09-12' });
    const row = await svc.getOrCreateBalance({ employeeId: e.id, leaveTypeId: type.id, dateStr: '2026-11-03' });
    assert.equal(row.periodStart, '2026-09-12');
    assert.equal(num(row.allotted), 6);
    assert.equal(num(row.accruedCredited), 6);
  });

  await t.test('yearly policy → no credit tracking, 8 for Sep–Dec', async () => {
    const { type, addEmployee } = setup({ accrual: 'yearly' });
    const e = addEmployee({ dateOfJoining: '2026-09-12' });
    const row = await svc.getOrCreateBalance({ employeeId: e.id, leaveTypeId: type.id, dateStr: '2026-11-03' });
    assert.equal(num(row.allotted), 8);
    assert.equal(row.accruedCredited, null);
  });

  await t.test('probation joined 20 Mar: open row from joining, nothing for March', async () => {
    const { type, addEmployee } = setup();
    const e = addEmployee({ dateOfJoining: '2026-03-20', employmentType: 'probation', probationPeriodDays: 6, probationPeriodUnit: 'months' });
    const row = await svc.getOrCreateBalance({ employeeId: e.id, leaveTypeId: type.id, dateStr: '2026-03-25' });
    assert.equal(row.periodStart, '2026-03-20');
    assert.equal(row.periodEnd, null);
    assert.equal(num(row.allotted), 0);
  });

  const newYear = async (opts, prevBalance) => {
    const { t: tb, type, addEmployee } = setup(opts);
    const e = addEmployee({ dateOfJoining: '2025-05-01' });
    tb.LeaveBalance.insert({ employeeId: e.id, leaveTypeId: type.id, year: 2026, periodStart: '2026-01-01', periodEnd: '2026-12-31', allotted: 24, used: 24 - prevBalance, balance: prevBalance, accruedCredited: 24 });
    return svc.getOrCreateBalance({ employeeId: e.id, leaveTypeId: type.id, dateStr: '2027-01-01' });
  };
  await t.test('new year after −4 (paid) → Jan 2 − 4 = −2', async () => {
    const row = await newYear({}, -4);
    assert.equal(num(row.carriedForward), -4);
    assert.equal(num(row.allotted), -2);
    assert.equal(num(row.accruedCredited), 2);
  });
  await t.test('new year after −4 (unpaid) → written off', async () => {
    const row = await newYear({ isPaid: false }, -4);
    assert.equal(num(row.carriedForward), 0);
    assert.equal(num(row.allotted), 2);
  });
  await t.test('new year after +8, carry on, cap 5 → 2 + 5', async () => {
    const row = await newYear({ carryForward: true, maxCarry: 5 }, 8);
    assert.equal(num(row.carriedForward), 5);
    assert.equal(num(row.allotted), 7);
  });
  await t.test('new year after +8, carry off → 2', async () => {
    const row = await newYear({}, 8);
    assert.equal(num(row.allotted), 2);
  });
  await t.test('yearly policy, new year after −3 → 24 − 3', async () => {
    const row = await newYear({ accrual: 'yearly' }, -3);
    assert.equal(num(row.allotted), 21);
  });
});

// ── 5. Monthly top-up keeps manual numbers ─────────────────────────────
test('monthly top-up', async (t) => {
  const policy = { accrual: 'monthly', annualQuota: 24 };
  const emp = { id: 1, companyId: 1, dateOfJoining: '2026-09-12', employmentType: 'full_time' };
  const mk = (tb, vals) => tb.LeaveBalance.insert({ employeeId: 1, leaveTypeId: 1, year: 2026, periodEnd: '2026-12-31', ...vals });
  const dec1 = { asOfStr: '2026-12-01', baselineAsOfStr: '2026-11-30' };

  await t.test('Ravi: old 1 Jan row corrected to 6 → 8', async () => {
    const { t: tb } = setup();
    const r = mk(tb, { periodStart: '2026-01-01', allotted: 6 });
    await svc.refreshMonthlyAccrual({ balance: r, policy, employee: emp, ...dec1 });
    assert.equal(num(r.allotted), 8);
    await svc.refreshMonthlyAccrual({ balance: r, policy, employee: emp, ...dec1 });
    assert.equal(num(r.allotted), 8, 'running twice changes nothing');
  });
  await t.test('Priya: 6 + 2 extra → 10, later manual edit kept', async () => {
    const { t: tb } = setup();
    const r = mk(tb, { periodStart: '2026-09-12', allotted: 8 });
    await svc.refreshMonthlyAccrual({ balance: r, policy, employee: emp, ...dec1 });
    assert.equal(num(r.allotted), 10);
    r.allotted = 11;
    await svc.refreshMonthlyAccrual({ balance: r, policy, employee: emp, asOfStr: '2026-12-20' });
    assert.equal(num(r.allotted), 11);
  });
  await t.test('used untouched, balance recomputed', async () => {
    const { t: tb } = setup();
    const r = mk(tb, { periodStart: '2026-09-12', allotted: 6, used: 3 });
    await svc.refreshMonthlyAccrual({ balance: r, policy, employee: emp, ...dec1 });
    assert.equal(num(r.used), 3);
    assert.equal(num(r.balance), 5);
  });
  await t.test('tracked row grows 2 per month', async () => {
    const { t: tb } = setup();
    const r = mk(tb, { periodStart: '2026-09-12', allotted: 2, accruedCredited: 2 });
    for (const d of ['2026-10-01', '2026-11-01', '2026-12-01']) await svc.refreshMonthlyAccrual({ balance: r, policy, employee: emp, asOfStr: d });
    assert.equal(num(r.allotted), 8);
  });
  await t.test('quota 24 → 18 from December: Sep–Nov at 2, Dec at 1.5', async () => {
    const { t: tb } = setup();
    const changed = { ...policy, annualQuota: 18, quotaHistory: [{ from: '0000-01', annualQuota: 24 }, { from: '2026-12', annualQuota: 18 }] };
    const r = mk(tb, { periodStart: '2026-09-12', allotted: 6, accruedCredited: 6 });
    await svc.refreshMonthlyAccrual({ balance: r, policy: changed, employee: emp, ...dec1 });
    assert.equal(num(r.allotted), 7.5);
  });
  await t.test('negative carry stays, months add on top (Jan −2 → Feb 0)', async () => {
    const { t: tb } = setup();
    const r = tb.LeaveBalance.insert({ employeeId: 1, leaveTypeId: 1, year: 2027, periodStart: '2027-01-01', periodEnd: '2027-12-31', carriedForward: -4, allotted: -2, accruedCredited: 2 });
    await svc.refreshMonthlyAccrual({ balance: r, policy, employee: emp, asOfStr: '2027-02-01' });
    assert.equal(num(r.allotted), 0);
    assert.equal(num(r.carriedForward), -4);
  });
});

// ── 5b. Policy switched from Yearly to Monthly mid-year ────────────────
test('policy switched Yearly → Monthly does not add on top of the yearly grant', async (t) => {
  const policySvc = require('../src/modules/leave/leavePolicy.service');
  const emp = { id: 1, companyId: 1, dateOfJoining: '2025-01-01', employmentType: 'full_time' };
  const monthly = { accrual: 'monthly', annualQuota: 24 };
  const today = require('../src/utils/dateRange').dateOnly(new Date());
  const year = Number(today.slice(0, 4));

  await t.test('switch marks the current grant as credited (only this policy\'s rosters)', async () => {
    const { t: tb, type, policy } = setup({ accrual: 'yearly' });
    tb.Employee.insert({ id: 1, companyId: 1, rosterGroupId: 1, dateOfJoining: '2025-01-01' });
    tb.Employee.insert({ id: 2, companyId: 1, rosterGroupId: 2, dateOfJoining: '2025-01-01' });
    const mine = tb.LeaveBalance.insert({ employeeId: 1, leaveTypeId: type.id, year, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`, allotted: 26, carriedForward: 2 });
    const other = tb.LeaveBalance.insert({ employeeId: 2, leaveTypeId: type.id, year, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`, allotted: 24 });
    const old = tb.LeaveBalance.insert({ employeeId: 1, leaveTypeId: type.id, year: year - 1, periodStart: `${year - 1}-01-01`, periodEnd: `${year - 1}-12-31`, allotted: 24 });
    await policySvc.markExistingCreditAsAccrued({ leavePolicyId: policy.id, leaveTypeId: type.id });
    assert.equal(num(mine.accruedCredited), 24, 'allotted − carried');
    assert.equal(other.accruedCredited, null, 'other roster untouched');
    assert.equal(old.accruedCredited, null, 'past period untouched');
  });

  await t.test('after the switch: July and December stay at 24, no reduction', async () => {
    const { t: tb } = setup();
    const r = tb.LeaveBalance.insert({ employeeId: 1, leaveTypeId: 1, year: 2026, periodStart: '2026-01-01', periodEnd: '2026-12-31', allotted: 24, accruedCredited: 24 });
    await svc.refreshMonthlyAccrual({ balance: r, policy: monthly, employee: emp, asOfStr: '2026-07-01' });
    assert.equal(num(r.allotted), 24);
    assert.equal(num(r.accruedCredited), 24);
    await svc.refreshMonthlyAccrual({ balance: r, policy: monthly, employee: emp, asOfStr: '2026-12-01' });
    assert.equal(num(r.allotted), 24);
  });
});

// ── 6. Realign (joining-date / probation corrections) ──────────────────
test('realign keeps manual numbers', async (t) => {
  await t.test('Ravi 1 Jan row corrected to 6 → moved to 12 Sep, still 6', async () => {
    const { t: tb, type, addEmployee } = setup();
    const e = addEmployee({ dateOfJoining: '2026-09-12' });
    const r = tb.LeaveBalance.insert({ employeeId: e.id, leaveTypeId: type.id, year: 2026, periodStart: '2026-01-01', periodEnd: '2026-12-31', allotted: 6 });
    const changes = await svc.realignEmployeeLeaveBalances({ employeeId: e.id, asOfStr: '2026-11-03' });
    assert.equal(changes.length, 1);
    assert.equal(r.periodStart, '2026-09-12');
    assert.equal(num(r.allotted), 6);
    assert.equal(num(r.accruedCredited), 6);
  });
  await t.test('dry run writes nothing', async () => {
    const { t: tb, type, addEmployee } = setup();
    const e = addEmployee({ dateOfJoining: '2026-09-12' });
    const r = tb.LeaveBalance.insert({ employeeId: e.id, leaveTypeId: type.id, year: 2026, periodStart: '2026-01-01', periodEnd: '2026-12-31', allotted: 6 });
    const changes = await svc.realignEmployeeLeaveBalances({ employeeId: e.id, asOfStr: '2026-11-03', dryRun: true });
    assert.equal(changes[0].to.allotted, 6);
    assert.equal(r.periodStart, '2026-01-01');
    assert.equal(r.accruedCredited, null);
  });
  await t.test('joining date moved later by admin → credit for lost months removed', async () => {
    const { t: tb, type, addEmployee } = setup();
    const e = addEmployee({ dateOfJoining: '2026-11-05' }); // was 12 Sep, admin corrected
    const r = tb.LeaveBalance.insert({ employeeId: e.id, leaveTypeId: type.id, year: 2026, periodStart: '2026-09-12', periodEnd: '2026-12-31', allotted: 6, accruedCredited: 6 });
    await svc.realignEmployeeLeaveBalances({ employeeId: e.id, asOfStr: '2026-11-10' });
    assert.equal(r.periodStart, '2026-11-05');
    assert.equal(num(r.allotted), 2, 'only November now');
  });
});

// ── 7. Monthly job end to end: 1 Dec → 1 Jan → 1 Feb ──────────────────
test('monthly job over three months', async () => {
  const { t: tb, type, addEmployee } = setup();
  const bal = (vals) => tb.LeaveBalance.insert({ leaveTypeId: type.id, year: 2026, periodEnd: '2026-12-31', ...vals });

  const ravi = addEmployee({ dateOfJoining: '2026-09-12' });
  const priya = addEmployee({ dateOfJoining: '2026-09-12' });
  const amit = addEmployee({ dateOfJoining: '2026-09-12' });
  const neha = addEmployee({ dateOfJoining: '2026-09-12' });
  const raviRow = bal({ employeeId: ravi.id, periodStart: '2026-01-01', allotted: 6, balance: 6 }); // old bug row, corrected
  const priyaRow = bal({ employeeId: priya.id, periodStart: '2026-09-12', allotted: 8, balance: 8 }); // 6 + 2 extra
  const amitRow = bal({ employeeId: amit.id, periodStart: '2026-01-01', allotted: 6, used: 12, balance: -6 }); // took 12
  const nehaRow = bal({ employeeId: neha.id, periodStart: '2026-01-01', allotted: 18, balance: 18 }); // never corrected

  await runLeaveAccrual({ asOf: day('2026-12-01') });
  await runLeaveAccrual({ asOf: day('2026-12-01') }); // second run same day
  assert.equal(num(raviRow.allotted), 8, 'Ravi 1 Dec');
  assert.equal(raviRow.periodStart, '2026-09-12', 'Ravi row moved to joining date');
  assert.equal(num(priyaRow.allotted), 10, 'Priya 1 Dec');
  assert.equal(num(amitRow.balance), -4, 'Amit 1 Dec');
  assert.equal(num(nehaRow.allotted), 20, 'Neha keeps her uncorrected number + Dec');

  await runLeaveAccrual({ asOf: day('2027-01-01') });
  const jan = (e) => tb.LeaveBalance.rows.find((r) => r.employeeId === e.id && r.periodStart === '2027-01-01');
  assert.equal(num(jan(ravi).allotted), 2, 'Ravi Jan (carry off)');
  assert.equal(num(jan(amit).carriedForward), -4, 'Amit −4 carried');
  assert.equal(num(jan(amit).allotted), -2, 'Amit Jan');
  assert.equal(amitRow.periodEnd, '2026-12-31', 'old row closed');

  await runLeaveAccrual({ asOf: day('2027-02-01') });
  assert.equal(num(jan(amit).allotted), 0, 'Amit Feb');
  assert.equal(num(jan(priya).allotted), 4, 'Priya Feb');
});
