'use strict';

// End-to-end leave scenarios (2026-11-04), offline against tests/fakeDb.js:
//   A. Probation (joined 13 Mar, 6 months) → queued Full-time roster on 1 Sep,
//      then through the new year.
//   B. Probation with no roster queued → nothing changes.
//   C. New-year carry-forward with a cap (5 left, cap 3 → 3 + 1.5).
//   D. Monthly quota changed mid-year (24 → 18 in May).
// Run: cd Backend && npm test

const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const { reset } = require('./fakeDb');

const svc = require('../src/modules/leave/leaveBalance.service');
const policySvc = require('../src/modules/leave/leavePolicy.service');
const { runLeaveAccrual } = require('../src/jobs/leaveAccrual.job');
const { confirmEmployee, runProbationConversions } = require('../src/modules/org/probationConversion.service');
const { computeProbationEndDate } = require('../src/utils/probation');

const day = (s) => new Date(`${s}T00:00:00`);
const num = (v) => Number(v);
const firstOfMonths = (from, to) => {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`);
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  return out;
};
const runJobs = async (from, to) => {
  for (const d of firstOfMonths(from, to)) await runLeaveAccrual({ asOf: day(d) });
};
// Freeze "now" (business time is IST) for code that reads today itself.
const atNow = async (iso, fn) => {
  mock.timers.enable({ apis: ['Date'], now: new Date(iso) });
  try {
    return await fn();
  } finally {
    mock.timers.reset();
  }
};
const setUsed = (row, used) => Object.assign(row, { used, balance: num(row.allotted) - used });

// Company 1 (Jan–Dec). Roster 1 = Probation (Casual 1/month, Sick 2/month),
// Roster 2 = Full-time (Annual 1.5/month). Casual carries forward (cap 3),
// Sick doesn't, Annual carries forward (cap 3).
function setupRosters() {
  const t = reset();
  t.Company.insert({ id: 1, yearlyCycleStartMonth: 1 });
  t.RosterGroup.insert({ id: 1, companyId: 1, name: 'Probation' });
  t.RosterGroup.insert({ id: 2, companyId: 1, name: 'Full-time' });
  const addType = (name, code, quota, rosterGroupId, carry) => {
    const type = t.LeaveType.insert({ companyId: 1, name, code, carryForward: carry != null, maxCarryForwardDays: carry ?? null });
    const policy = t.LeavePolicy.insert({ companyId: 1, leaveTypeId: type.id, accrual: 'monthly', annualQuota: quota });
    t.RosterGroupLeavePolicy.insert({ rosterGroupId, leavePolicyId: policy.id, leaveTypeId: type.id });
    return type;
  };
  const casual = addType('Casual Leave', 'CL', 12, 1, 3);
  const sick = addType('Sick Leave', 'SL', 24, 1, null);
  const annual = addType('Annual Leave', 'AL', 18, 2, 3);
  const employee = t.Employee.insert({
    companyId: 1,
    rosterGroupId: 1,
    employmentType: 'probation',
    dateOfJoining: '2026-03-13',
    probationPeriodDays: 6,
    probationPeriodUnit: 'months',
    nextRosterGroupId: 2,
  });
  const rows = (typeId) => t.LeaveBalance.rows.filter((r) => r.employeeId === employee.id && r.leaveTypeId === typeId);
  return { t, casual, sick, annual, employee, rows };
}

// ── A. Probation → Full-time ──────────────────────────────────────────
test('A. joined 13 Mar, 6-month probation, Full-time roster queued', async (t) => {
  const s = setupRosters();
  const { t: tb, casual, sick, annual, employee, rows } = s;

  await t.test('probation ends 31 Aug (13th ≤ 15th, March is month 1)', () => {
    assert.equal(computeProbationEndDate(employee), '2026-08-31');
  });

  await t.test('during probation: Casual 6, Sick 12 by August, one open row each', async () => {
    await svc.getOrCreateBalance({ employeeId: employee.id, leaveTypeId: casual.id, dateStr: '2026-03-20' });
    await svc.getOrCreateBalance({ employeeId: employee.id, leaveTypeId: sick.id, dateStr: '2026-03-20' });
    assert.equal(num(rows(casual.id)[0].allotted), 1, 'March counted');
    await runJobs('2026-04', '2026-08');
    for (const [type, want] of [[casual, 6], [sick, 12]]) {
      const r = rows(type.id);
      assert.equal(r.length, 1);
      assert.equal(r[0].periodStart, '2026-03-13');
      assert.equal(r[0].periodEnd, null);
      assert.equal(num(r[0].allotted), want);
    }
    assert.equal(rows(annual.id).length, 0, 'no Annual Leave on the probation roster');
    setUsed(rows(casual.id)[0], 2); // Casual left: 4
    setUsed(rows(sick.id)[0], 3); // Sick left: 9
  });

  await t.test('31 Aug: not due yet', async () => {
    const { converted } = await runProbationConversions({ asOf: day('2026-08-31') });
    assert.equal(converted, 0);
    assert.equal(employee.employmentType, 'probation');
  });

  await t.test('1 Sep: confirmed, roster switched, leaves moved', async () => {
    const result = await atNow('2026-09-01T00:35:00+05:30', () =>
      confirmEmployee({ employeeId: employee.id, confirmedOn: '2026-09-01' })
    );
    assert.equal(result.rosterChanged, true, result.rosterError || '');
    assert.equal(employee.employmentType, 'full_time');
    assert.equal(employee.confirmedOn, '2026-09-01');
    assert.equal(employee.rosterGroupId, 2);
    assert.equal(employee.nextRosterGroupId, null);

    const [cl] = rows(casual.id);
    const [sl] = rows(sick.id);
    assert.equal(cl.periodEnd, '2026-08-31', 'probation row closed');
    assert.equal(sl.periodEnd, '2026-08-31');
    assert.equal(num(cl.balance), 0, 'Casual moved out');
    assert.equal(num(cl.used), 2, 'used kept as history');
    assert.equal(num(sl.balance), 0, 'Sick lost (no carry forward)');

    const cfType = tb.LeaveType.rows.find((r) => r.name === 'Carry Forward - Casual Leave');
    assert.ok(cfType, 'Casual carry-forward bucket created');
    const [cf] = rows(cfType.id);
    assert.equal(num(cf.balance), 3, '4 left, cap 3 → 3');
    assert.equal(cf.periodStart, '2026-09-01');
    assert.equal(cf.periodEnd, '2026-12-31');
    assert.ok(!tb.LeaveType.rows.some((r) => r.name === 'Carry Forward - Sick Leave'), 'no bucket for Sick');

    const [al] = rows(annual.id);
    assert.equal(al.periodStart, '2026-09-01');
    assert.equal(al.periodEnd, '2026-12-31');
    assert.equal(num(al.allotted), 1.5, 'September credited');
    assert.equal(tb.RosterTransferLog.rows.length, 1);
  });

  await t.test('Sep–Dec: Annual grows to 6, bucket stays 3', async () => {
    await runJobs('2026-10', '2026-12');
    assert.equal(num(rows(annual.id)[0].allotted), 6);
    const cfType = tb.LeaveType.rows.find((r) => r.name === 'Carry Forward - Casual Leave');
    assert.equal(num(rows(cfType.id)[0].balance), 3);
    assert.equal(rows(casual.id).length, 1, 'no new Casual rows after the switch');
  });

  await t.test('1 Jan 2027: Annual 5 left, cap 3 → 3 + 1.5 = 4.5; bucket expires', async () => {
    setUsed(rows(annual.id)[0], 1); // Annual left: 5
    await runJobs('2027-01', '2027-01');
    const jan = rows(annual.id).find((r) => r.periodStart === '2027-01-01');
    assert.equal(num(jan.carriedForward), 3);
    assert.equal(num(jan.allotted), 4.5);
    assert.equal(rows(annual.id)[0].periodEnd, '2026-12-31');

    const cfType = tb.LeaveType.rows.find((r) => r.name === 'Carry Forward - Casual Leave');
    const cfJan = rows(cfType.id).find((r) => r.periodStart === '2027-01-01');
    assert.ok(!cfJan || num(cfJan.balance) === 0, 'bucket does not carry into 2027');

    await runJobs('2027-02', '2027-02');
    assert.equal(num(jan.allotted), 6, 'Feb: 4.5 + 1.5');
  });
});

// ── B. No roster queued ───────────────────────────────────────────────
test('B. probation ended but no roster queued → nothing changes', async () => {
  const { casual, employee, rows } = setupRosters();
  employee.nextRosterGroupId = null;
  await svc.getOrCreateBalance({ employeeId: employee.id, leaveTypeId: casual.id, dateStr: '2026-03-20' });
  await runJobs('2026-04', '2026-09');

  const { converted } = await runProbationConversions({ asOf: day('2026-09-05') });
  assert.equal(converted, 0);
  assert.equal(employee.employmentType, 'probation');
  assert.equal(employee.rosterGroupId, 1);
  const r = rows(casual.id);
  assert.equal(r.length, 1, 'same open probation row');
  assert.equal(r[0].periodEnd, null);
  assert.equal(num(r[0].allotted), 7, 'keeps accruing: Mar–Sep');
});

// ── C. New-year carry-forward with a cap ──────────────────────────────
test('C. new year: Annual 1.5/month, carry cap 3', async (t) => {
  const yearEnd = async (left) => {
    const tb = reset();
    tb.Company.insert({ id: 1, yearlyCycleStartMonth: 1 });
    const type = tb.LeaveType.insert({ companyId: 1, name: 'Annual Leave', carryForward: true, maxCarryForwardDays: 3 });
    const policy = tb.LeavePolicy.insert({ companyId: 1, leaveTypeId: type.id, accrual: 'monthly', annualQuota: 18 });
    tb.RosterGroupLeavePolicy.insert({ rosterGroupId: 1, leavePolicyId: policy.id, leaveTypeId: type.id });
    const e = tb.Employee.insert({ companyId: 1, rosterGroupId: 1, employmentType: 'full_time', dateOfJoining: '2025-01-01' });
    tb.LeaveBalance.insert({ employeeId: e.id, leaveTypeId: type.id, year: 2026, periodStart: '2026-01-01', periodEnd: '2026-12-31', allotted: 18, accruedCredited: 18, used: 18 - left, balance: left });
    await runLeaveAccrual({ asOf: day('2027-01-01') });
    return tb.LeaveBalance.rows.find((r) => r.periodStart === '2027-01-01');
  };
  await t.test('5 left → 3 carried + 1.5 = 4.5', async () => {
    const row = await yearEnd(5);
    assert.equal(num(row.carriedForward), 3);
    assert.equal(num(row.allotted), 4.5);
  });
  await t.test('2 left (under the cap) → 2 + 1.5 = 3.5', async () => {
    const row = await yearEnd(2);
    assert.equal(num(row.allotted), 3.5);
  });
  await t.test('−2 (over-used) → cap ignored, −2 + 1.5 = −0.5', async () => {
    const row = await yearEnd(-2);
    assert.equal(num(row.carriedForward), -2);
    assert.equal(num(row.allotted), -0.5);
  });
});

// ── D. Monthly quota changed mid-year ─────────────────────────────────
function setupQuota() {
  const tb = reset();
  tb.Company.insert({ id: 1, yearlyCycleStartMonth: 1 });
  const type = tb.LeaveType.insert({ companyId: 1, name: 'Annual Leave' });
  const policy = tb.LeavePolicy.insert({ companyId: 1, leaveTypeId: type.id, accrual: 'monthly', annualQuota: 24 });
  tb.RosterGroupLeavePolicy.insert({ rosterGroupId: 1, leavePolicyId: policy.id, leaveTypeId: type.id });
  const e = tb.Employee.insert({ companyId: 1, rosterGroupId: 1, employmentType: 'full_time', dateOfJoining: '2025-01-01' });
  const rowFor = (start) => tb.LeaveBalance.rows.find((r) => r.periodStart === start);
  const update = (iso, updates) =>
    atNow(iso, () => policySvc.updateLeavePolicy({ companyId: 1, id: policy.id, updates }));
  return { tb, policy, e, rowFor, update };
}

test('D. quota 24 → 18 changed in May', async (t) => {
  await t.test('Jan–May at 2, Jun–Dec at 1.5 → 20.5 for 2026; 1.5/month in 2027', async () => {
    const { policy, rowFor, update } = setupQuota();
    await runJobs('2026-01', '2026-05');
    const row = rowFor('2026-01-01');
    assert.equal(num(row.allotted), 10);
    setUsed(row, 4);

    await update('2026-05-15T10:00:00+05:30', { annualQuota: 18 });
    assert.deepEqual(policy.quotaHistory, [{ from: '0000-01', annualQuota: 24 }, { from: '2026-06', annualQuota: 18 }]);
    assert.equal(num(row.allotted), 10, 'nothing taken back on the change');

    await runJobs('2026-05', '2026-06');
    assert.equal(num(row.allotted), 11.5, 'May stays at 2, June at 1.5');
    await runJobs('2026-07', '2026-12');
    assert.equal(num(row.allotted), 20.5);
    assert.equal(num(row.used), 4, 'used untouched');
    assert.equal(num(row.balance), 16.5);

    await runJobs('2027-01', '2027-03');
    assert.equal(num(rowFor('2027-01-01').allotted), 4.5, '2027: 1.5 × 3');
  });

  await t.test('changed twice in May (24 → 18 → 20): only the last counts, from June', async () => {
    const { policy, rowFor, update } = setupQuota();
    await runJobs('2026-01', '2026-05');
    await update('2026-05-15T10:00:00+05:30', { annualQuota: 18 });
    await update('2026-05-20T10:00:00+05:30', { annualQuota: 20 });
    assert.deepEqual(policy.quotaHistory, [{ from: '0000-01', annualQuota: 24 }, { from: '2026-06', annualQuota: 20 }]);
    await runJobs('2026-06', '2026-12');
    assert.equal(num(rowFor('2026-01-01').allotted), 21.67, '10 + 7 × 20/12');
  });

  await t.test('admin correction kept through a quota change', async () => {
    const { rowFor, update } = setupQuota();
    await runJobs('2026-01', '2026-05');
    const row = rowFor('2026-01-01');
    row.allotted = 12; // admin gave 2 extra
    await update('2026-05-15T10:00:00+05:30', { annualQuota: 18 });
    await runJobs('2026-06', '2026-06');
    assert.equal(num(row.allotted), 13.5, '12 + June 1.5');
  });

  await t.test('switching Monthly → Yearly drops the rate history', async () => {
    const { policy, update } = setupQuota();
    await update('2026-05-15T10:00:00+05:30', { annualQuota: 18 });
    await update('2026-05-16T10:00:00+05:30', { accrual: 'yearly', partialYearMode: 'months_remaining' });
    assert.equal(policy.quotaHistory, null);
  });
});
