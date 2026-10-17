'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { getBrandScope } = require('../../middleware/rbac.middleware');
const { dateOnly, datesBetween } = require('../../utils/dateRange');
const attendanceService = require('../attendance/attendance.service');
const { resolvePayrollAccess } = require('../payroll/payrollAccess');
const { currentLeaveBalancesFor } = require('./reportLeaveBalances');

// Employee Reports — several employees x several months (a month range or a
// whole year) in one report: per-employee totals for the period, a per-month
// breakdown, every leave / OD / regularization / comp-off in the period, and
// (export only) each day's attendance. Per month it reuses
// attendanceService.listAttendanceBoard (same payable / LOP rules as payroll).
// Admins only — Super Admin is refused by the controller.

const MAX_EMPLOYEES = 500;
const MAX_MONTHS = 12;
const MAX_EMPLOYEE_MONTHS = 3000;

const pad2 = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (v == null ? null : Number(v));

// 'YYYY-MM' -> { y, m }
function parseYearMonth(value, label) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  const y = match ? Number(match[1]) : NaN;
  const m = match ? Number(match[2]) : NaN;
  if (!match || m < 1 || m > 12 || y < 2000 || y > 2100) throw new HttpError(400, `${label} must be YYYY-MM`);
  return { y, m };
}

function monthsBetween(from, to) {
  const out = [];
  for (let k = from.y * 12 + from.m - 1; k <= to.y * 12 + to.m - 1; k++) {
    out.push({ year: Math.floor(k / 12), month: (k % 12) + 1 });
  }
  return out;
}

// The caller's readable employees among `employeeIds`: the tenant hook keeps
// a company-scoped caller inside their company, a Group Admin is confined to
// their Group, a brand-scoped reader (Brand Admin / Brand-level power) to
// their Brand(s). Anything else is dropped (reported as `skipped`).
async function loadReadableEmployees(auth, employeeIds) {
  const employees = await db.Employee.findAll({
    where: { id: { [Op.in]: employeeIds } },
    attributes: ['id', 'name', 'employeeCode', 'companyId', 'brandId', 'status', 'dateOfJoining', 'employmentType'],
    include: [
      { model: db.Company, as: 'company', attributes: ['id', 'name', 'groupId'] },
      { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
      { model: db.Department, as: 'department', attributes: ['id', 'name'] },
      { model: db.Designation, as: 'designation', attributes: ['id', 'title'] },
    ],
    order: [['name', 'ASC']],
  });

  let allowed = employees;
  if (!auth.companyId && auth.groupId) {
    allowed = allowed.filter((e) => e.company && String(e.company.groupId) === String(auth.groupId));
  }
  const scope = await getBrandScope(auth, 'employee:read');
  if (!scope.allowed) throw new HttpError(403, 'Forbidden');
  if (!scope.companyWide) {
    const brandIds = new Set(scope.brandIds.map(String));
    allowed = allowed.filter((e) => brandIds.has(String(e.brandId)));
  }
  return allowed;
}

// Per-employee "may this caller see payroll figures" — same rule as the
// single-employee report (employeeMonthlyReport.service.js).
async function payrollVisibility(auth) {
  const access = await resolvePayrollAccess(auth);
  return (employee) => {
    if (!access) return false;
    if (access.canManage) return !!employee.company && String(employee.company.groupId) === access.groupId;
    if (String(employee.companyId) !== access.companyId) return false;
    return !access.scopedBrandIds || access.scopedBrandIds.includes(String(employee.brandId));
  };
}

const SUMMARY_KEYS = ['present', 'onDuty', 'halfDay', 'leave', 'absent', 'holiday', 'weekoff', 'workedMinutes'];
const PAY_KEYS = ['countedDays', 'payableDays', 'lopDays', 'paidLeave', 'unpaidLeave', 'sandwichLop', 'missedCheckouts'];

function emptyTotals() {
  return Object.fromEntries([...SUMMARY_KEYS, ...PAY_KEYS].map((k) => [k, 0]));
}

function monthFigures(boardRow) {
  const s = boardRow.summary;
  const p = boardRow.pay;
  return {
    present: s.present ?? 0,
    onDuty: s.on_duty ?? 0,
    halfDay: s.half_day ?? 0,
    leave: s.leave ?? 0,
    absent: s.absent ?? 0,
    holiday: s.holiday ?? 0,
    weekoff: s.weekoff ?? 0,
    workedMinutes: s.workedMinutes ?? 0,
    countedDays: p.countedDays ?? 0,
    payableDays: round2(p.payableDays),
    lopDays: round2(p.lopDays),
    paidLeave: round2(p.paidLeave),
    unpaidLeave: round2(p.unpaidLeave),
    sandwichLop: round2(p.sandwichLop),
    missedCheckouts: p.missedCheckouts ?? 0,
    lopDates: p.lopDates ?? [],
  };
}

// The report's months: `months` (['YYYY-MM', ...] — any picked months, not
// necessarily consecutive) or a `from`..`to` range. Sorted, de-duplicated.
function resolveMonths({ months, from, to }) {
  let list;
  if (Array.isArray(months) && months.length > 0) {
    const seen = new Map();
    for (const value of months) {
      const { y, m } = parseYearMonth(value, 'months');
      seen.set(y * 12 + m - 1, { year: y, month: m });
    }
    list = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  } else {
    list = monthsBetween(parseYearMonth(from, 'from'), parseYearMonth(to, 'to'));
  }
  if (list.length === 0) throw new HttpError(400, 'Pick at least one month');
  if (list.length > MAX_MONTHS) throw new HttpError(400, `At most ${MAX_MONTHS} months per report`);
  return list;
}

const ymKey = (dateStr) => String(dateStr).slice(0, 7);

async function buildPeriodReport({ auth, employeeIds, months: pickedMonths, from, to, includeDays = false }) {
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) throw new HttpError(400, 'Select at least one employee');
  if (employeeIds.length > MAX_EMPLOYEES) throw new HttpError(400, `At most ${MAX_EMPLOYEES} employees per report`);
  const months = resolveMonths({ months: pickedMonths, from, to });
  const fromYm = { y: months[0].year, m: months[0].month };
  const toYm = { y: months[months.length - 1].year, m: months[months.length - 1].month };
  const pickedKeys = new Set(months.map(({ year, month }) => `${year}-${pad2(month)}`));
  // A record belongs to the report when one of its days falls in a picked month.
  const touchesPicked = (fromDate, toDate = fromDate) =>
    datesBetween(String(fromDate).slice(0, 10), String(toDate).slice(0, 10)).some((d) => pickedKeys.has(ymKey(d)));

  const employees = await loadReadableEmployees(auth, [...new Set(employeeIds.map(String))]);
  if (employees.length === 0) throw new HttpError(404, 'None of the selected employees are available to you');
  if (employees.length * months.length > MAX_EMPLOYEE_MONTHS) {
    throw new HttpError(400, `Too large — pick fewer employees or months (max ${MAX_EMPLOYEE_MONTHS} employee-months)`);
  }

  const ids = employees.map((e) => e.id);
  const companyIds = [...new Set(employees.map((e) => e.companyId))];
  const periodStart = `${fromYm.y}-${pad2(fromYm.m)}-01`;
  const periodEnd = `${toYm.y}-${pad2(toYm.m)}-${pad2(new Date(toYm.y, toYm.m, 0).getDate())}`;
  const todayStr = dateOnly(new Date());
  const canSeePayroll = await payrollVisibility(auth);

  // One board query per month, covering every selected employee at once.
  const boards = [];
  for (const { year, month } of months) {
    // eslint-disable-next-line no-await-in-loop
    const board = await attendanceService.listAttendanceBoard({
      companyId: companyIds.length === 1 ? companyIds[0] : companyIds,
      brandIds: null,
      year,
      month,
      employeeIds: ids,
    });
    boards.push({ year, month, board });
  }

  const [allLeaveRequests, allOdRequests, allRegularizations, allCompOffCredits, payrolls] = await Promise.all([
    db.LeaveRequest.findAll({
      where: { employeeId: { [Op.in]: ids }, fromDate: { [Op.lte]: periodEnd }, toDate: { [Op.gte]: periodStart } },
      include: [{ model: db.LeaveType, as: 'leaveType', attributes: ['name', 'isPaid'] }],
      order: [['fromDate', 'ASC']],
    }),
    db.OdRequest.findAll({
      where: { employeeId: { [Op.in]: ids }, fromDate: { [Op.lte]: periodEnd }, toDate: { [Op.gte]: periodStart } },
      order: [['fromDate', 'ASC']],
    }),
    db.AttendanceRegularization.findAll({
      where: { employeeId: { [Op.in]: ids } },
      include: [
        {
          model: db.Attendance,
          as: 'attendance',
          attributes: ['date'],
          required: true,
          where: { date: { [Op.gte]: periodStart, [Op.lte]: periodEnd } },
        },
      ],
      order: [['createdAt', 'ASC']],
    }),
    db.CompOffCredit.findAll({
      where: { employeeId: { [Op.in]: ids }, earnedDate: { [Op.gte]: periodStart, [Op.lte]: periodEnd } },
      order: [['earnedDate', 'ASC']],
    }),
    db.EmployeePayroll.findAll({
      where: { employeeId: { [Op.in]: ids }, periodStart: { [Op.gte]: periodStart, [Op.lte]: periodEnd } },
      attributes: ['employeeId', 'periodYear', 'periodMonth', 'paidDays', 'lopDays', 'grossEarned', 'totalDeductions', 'netPay'],
    }),
  ]);

  // Only records touching a PICKED month (the query spans first..last pick).
  const leaveRequests = allLeaveRequests.filter((r) => touchesPicked(r.fromDate, r.toDate));
  const odRequests = allOdRequests.filter((r) => touchesPicked(r.fromDate, r.toDate));
  const regularizations = allRegularizations.filter((r) => r.attendance && touchesPicked(r.attendance.date));
  const compOffCredits = allCompOffCredits.filter((c) => touchesPicked(c.earnedDate));

  // Assigned leave types + current balance (as of today) per employee.
  const balancesByEmployee = await currentLeaveBalancesFor(employees);

  const payrollByKey = new Map(payrolls.map((p) => [`${p.employeeId}|${p.periodYear}-${p.periodMonth}`, p]));
  const employeeById = new Map(employees.map((e) => [String(e.id), e]));
  const nameOf = (employeeId) => employeeById.get(String(employeeId))?.name ?? '—';
  const codeOf = (employeeId) => employeeById.get(String(employeeId))?.employeeCode ?? null;

  const rows = employees.map((e) => {
    const key = String(e.id);
    const showPayroll = canSeePayroll(e);
    const totals = emptyTotals();
    let netPayTotal = showPayroll ? 0 : null;
    const monthRows = [];
    const days = [];
    let lastWorkingDate = null;

    for (const { year, month, board } of boards) {
      const boardRow = board.rows.find((r) => String(r.employeeId) === key);
      const monthStart = `${year}-${pad2(month)}-01`;
      if (!boardRow || monthStart > todayStr) {
        monthRows.push({ year, month, available: false });
        continue;
      }
      lastWorkingDate = boardRow.lastWorkingDate ?? lastWorkingDate;
      const figures = monthFigures(boardRow);
      for (const k of [...SUMMARY_KEYS, ...PAY_KEYS]) totals[k] += figures[k];

      const p = showPayroll ? payrollByKey.get(`${key}|${year}-${month}`) : null;
      const payroll = !showPayroll
        ? null
        : p
          ? { generated: true, paidDays: num(p.paidDays), lopDays: num(p.lopDays), grossEarned: num(p.grossEarned), totalDeductions: num(p.totalDeductions), netPay: num(p.netPay) }
          : { generated: false };
      if (p && netPayTotal != null) netPayTotal += Number(p.netPay) || 0;

      monthRows.push({ year, month, available: true, ...figures, payroll });

      if (includeDays) {
        for (const d of boardRow.days) {
          if (!d.category) continue;
          days.push({
            date: `${year}-${pad2(month)}-${pad2(d.day)}`,
            status: d.category,
            code: d.code,
            checkIn: d.checkIn,
            checkOut: d.checkOut,
            checkoutMissed: !!d.checkoutMissed,
            workedMinutes: d.workedMinutes ?? null,
            workedMinutesBasis: d.workedMinutesBasis ?? null,
          });
        }
      }
    }

    for (const k of PAY_KEYS) totals[k] = round2(totals[k]);
    return {
      employee: {
        id: e.id,
        name: e.name,
        employeeCode: e.employeeCode,
        companyName: e.company?.name ?? null,
        brandName: e.brand?.name ?? null,
        departmentName: e.department?.name ?? null,
        designationName: e.designation?.title ?? null,
        status: e.status,
        employmentType: e.employmentType,
        dateOfJoining: e.dateOfJoining,
        lastWorkingDate,
      },
      totals: { ...totals, netPay: netPayTotal == null ? null : round2(netPayTotal) },
      payrollVisible: showPayroll,
      leaveBalances: balancesByEmployee.get(key) ?? [],
      months: monthRows,
      ...(includeDays ? { days } : {}),
    };
  });

  return {
    from: `${fromYm.y}-${pad2(fromYm.m)}`,
    to: `${toYm.y}-${pad2(toYm.m)}`,
    periodStart,
    periodEnd,
    asOf: periodEnd < todayStr ? periodEnd : todayStr,
    months,
    monthKeys: [...pickedKeys],
    skipped: employeeIds.length - employees.length,
    rows,
    leaveRequests: leaveRequests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: nameOf(r.employeeId),
      employeeCode: codeOf(r.employeeId),
      leaveTypeName: r.leaveType?.name ?? 'Leave',
      isPaid: !!r.leaveType?.isPaid,
      fromDate: r.fromDate,
      toDate: r.toDate,
      halfDaySession: r.halfDaySession,
      days: num(r.days),
      status: r.status,
      reason: r.reason,
      rejectionReason: r.rejectionReason ?? r.revokeReason ?? null,
    })),
    odRequests: odRequests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: nameOf(r.employeeId),
      employeeCode: codeOf(r.employeeId),
      fromDate: r.fromDate,
      toDate: r.toDate,
      purpose: r.purpose,
      location: r.location,
      status: r.status,
      rejectionReason: r.rejectionReason ?? r.revokeReason ?? null,
    })),
    regularizations: regularizations.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: nameOf(r.employeeId),
      employeeCode: codeOf(r.employeeId),
      date: r.attendance?.date ?? null,
      requestedStatus: r.requestedStatus,
      requestedCheckIn: r.requestedCheckIn,
      requestedCheckOut: r.requestedCheckOut,
      reason: r.reason,
      status: r.status,
      rejectionReason: r.rejectionReason ?? r.revokeReason ?? null,
    })),
    compOffCredits: compOffCredits.map((c) => ({
      id: c.id,
      employeeId: c.employeeId,
      employeeName: nameOf(c.employeeId),
      employeeCode: codeOf(c.employeeId),
      earnedDate: c.earnedDate,
      expiryDate: c.expiryDate,
      status: c.status,
    })),
  };
}

module.exports = { buildPeriodReport };
