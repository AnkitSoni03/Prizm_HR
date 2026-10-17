'use strict';

const { runAsCompany } = require('../../config/tenant-context');
const leaveBalanceService = require('../leave/leaveBalance.service');

// The leave types an employee is assigned (their Roster's leave policies)
// with the CURRENT balance of each — exactly what their own Leave Balance
// page shows: missing rows are seeded first (ensureBalancesForEmployee, the
// same lazy step that page takes), then the current rows are filtered to the
// Roster's types by attachAccrualInfo, which also adds linked types (e.g.
// Half Day drawing on Annual Leave). Used by both Monthly Report services.

const num = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100);

async function currentLeaveBalances(employee) {
  return runAsCompany(employee.companyId, async () => {
    await leaveBalanceService.ensureBalancesForEmployee({ employeeId: employee.id });
    const { rows } = await leaveBalanceService.listLeaveBalances({
      companyId: employee.companyId,
      employeeId: employee.id,
      limit: 100,
      offset: 0,
    });
    const assigned = await leaveBalanceService.attachAccrualInfo(rows, employee.id);
    return assigned
      .map((b) => ({
        leaveTypeName: b.leaveType?.name ?? 'Leave',
        leaveTypeCode: b.leaveType?.code ?? null,
        isPaid: b.leaveType ? !!b.leaveType.isPaid : true,
        isUnlimited: !!b.isUnlimited,
        accrual: b.accrual ?? null,
        linkedToName: b.linkedTo?.name ?? null,
        periodStart: b.periodStart ?? null,
        periodEnd: b.periodEnd ?? null,
        carriedForward: num(b.carriedForward ?? 0),
        allotted: num(b.allotted),
        used: num(b.used),
        balance: num(b.balance),
      }))
      .sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName));
  });
}

// Same, for many employees — a few at a time so a big report doesn't open
// hundreds of queries at once. Returns Map(employeeId -> balances[]).
async function currentLeaveBalancesFor(employees, concurrency = 8) {
  const result = new Map();
  for (let i = 0; i < employees.length; i += concurrency) {
    const batch = employees.slice(i, i + concurrency);
    // eslint-disable-next-line no-await-in-loop
    const lists = await Promise.all(batch.map((e) => currentLeaveBalances(e).catch(() => [])));
    batch.forEach((e, idx) => result.set(String(e.id), lists[idx]));
  }
  return result;
}

module.exports = { currentLeaveBalances, currentLeaveBalancesFor };
