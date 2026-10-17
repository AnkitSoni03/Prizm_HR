'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const { dateOnly } = require('../../utils/dateRange');
const attendanceService = require('../attendance/attendance.service');
const { resolvePayrollAccess } = require('../payroll/payrollAccess');
const { currentLeaveBalances } = require('./reportLeaveBalances');

// One employee's Monthly Report (Employee popup → "Monthly Report" tab):
// day-by-day attendance with working hours, the month's totals with
// payable / LOP days (attendanceService.listAttendanceBoard — same rules as
// payroll), and every leave / OD / regularization / comp-off record touching
// the month, the assigned leave types with their current balance, and — only for a caller who can
// view payroll for this employee — that month's payroll figures.
//
// The caller has already been confined to this employee by the controller
// (employee.controller.js::getReadableEmployee). Everything runs under the
// EMPLOYEE's company tenant context (a Group Admin's own context is
// company-less).

const pad2 = (n) => String(n).padStart(2, '0');

function parseMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12 || y < 2000 || y > 2100) {
    throw new HttpError(400, 'year and month (1-12) are required');
  }
  const daysInMonth = new Date(y, m, 0).getDate();
  return { y, m, monthStart: `${y}-${pad2(m)}-01`, monthEnd: `${y}-${pad2(m)}-${pad2(daysInMonth)}`, daysInMonth };
}

const num = (v) => (v == null ? null : Number(v));

async function canViewPayroll(auth, employee) {
  const access = await resolvePayrollAccess(auth);
  if (!access) return false;
  if (access.canManage) {
    const company = await runAsCompany(null, () => db.Company.findByPk(employee.companyId, { attributes: ['groupId'] }));
    return !!company && String(company.groupId) === access.groupId;
  }
  if (String(employee.companyId) !== access.companyId) return false;
  return !access.scopedBrandIds || access.scopedBrandIds.includes(String(employee.brandId));
}

async function buildMonthlyReport({ auth, employee, year, month }) {
  const { y, m, monthStart, monthEnd, daysInMonth } = parseMonth(year, month);
  const todayStr = dateOnly(new Date());
  const companyId = employee.companyId;
  const showPayroll = await canViewPayroll(auth, employee);

  return runAsCompany(companyId, async () => {
    const historyTo = monthEnd < todayStr ? monthEnd : todayStr;
    const [board, history, leaveRequests, odRequests, regularizations, compOffCredits, balances, payroll, shift] =
      await Promise.all([
        attendanceService.listAttendanceBoard({ companyId, brandIds: null, year: y, month: m, employeeIds: [employee.id] }),
        monthStart <= historyTo
          ? attendanceService.listMyAttendanceHistory({ companyId, employeeId: employee.id, from: monthStart, to: historyTo })
          : { rows: [] },
        db.LeaveRequest.findAll({
          where: { employeeId: employee.id, fromDate: { [Op.lte]: monthEnd }, toDate: { [Op.gte]: monthStart } },
          include: [{ model: db.LeaveType, as: 'leaveType', attributes: ['name', 'code', 'isPaid'] }],
          order: [['fromDate', 'ASC']],
        }),
        db.OdRequest.findAll({
          where: { employeeId: employee.id, fromDate: { [Op.lte]: monthEnd }, toDate: { [Op.gte]: monthStart } },
          order: [['fromDate', 'ASC']],
        }),
        db.AttendanceRegularization.findAll({
          where: { employeeId: employee.id },
          include: [
            {
              model: db.Attendance,
              as: 'attendance',
              attributes: ['date'],
              required: true,
              where: { date: { [Op.gte]: monthStart, [Op.lte]: monthEnd } },
            },
          ],
          order: [['createdAt', 'ASC']],
        }),
        db.CompOffCredit.findAll({
          where: { employeeId: employee.id, earnedDate: { [Op.gte]: monthStart, [Op.lte]: monthEnd } },
          order: [['earnedDate', 'ASC']],
        }),
        currentLeaveBalances(employee),
        showPayroll
          ? db.EmployeePayroll.findOne({ where: { employeeId: employee.id, periodYear: y, periodMonth: m } })
          : null,
        attendanceService.resolveShiftForDate({ employeeId: employee.id, dateStr: historyTo >= monthStart ? historyTo : monthStart }),
      ]);

    const boardRow = board.rows[0] ?? null;
    const historyByDate = new Map(history.rows.map((r) => [r.date, r]));
    const boardDays = new Map((boardRow?.days ?? []).map((d) => [d.day, d]));

    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${y}-${pad2(m)}-${pad2(day)}`;
      const h = historyByDate.get(date);
      const b = boardDays.get(day);
      days.push({
        date,
        status: h?.status ?? null, // null = before joining / upcoming
        code: b?.code ?? null,
        leaveTypeName: h?.leaveTypeName ?? null,
        leaveHalfDaySession: h?.leaveHalfDaySession ?? null,
        checkIn: h?.checkIn ?? null,
        checkOut: h?.checkOut ?? null,
        checkoutMissed: !!h?.checkoutMissed,
        workedMinutes: h?.workedMinutes ?? null,
        workedMinutesBasis: h?.workedMinutesBasis ?? null,
        source: h?.source ?? null,
      });
    }

    const summary = boardRow?.summary ?? {};
    const pay = boardRow?.pay ?? {};
    return {
      employee: {
        id: employee.id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        companyName: employee.company?.name ?? null,
        brandName: employee.brand?.name ?? null,
        departmentName: employee.department?.name ?? null,
        designationName: employee.designation?.title ?? null,
        managerName: employee.manager?.name ?? null,
        rosterName: employee.rosterGroup?.name ?? null,
        employmentType: employee.employmentType,
        status: employee.status,
        dateOfJoining: employee.dateOfJoining,
        lastWorkingDate: boardRow?.lastWorkingDate ?? null,
        shiftName: shift?.name ?? null,
        shiftTime: shift?.startTime && shift?.endTime ? `${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)}` : null,
      },
      year: y,
      month: m,
      daysInMonth,
      asOf: historyTo,
      summary: {
        present: summary.present ?? 0,
        onDuty: summary.on_duty ?? 0,
        halfDay: summary.half_day ?? 0,
        leave: summary.leave ?? 0,
        absent: summary.absent ?? 0,
        holiday: summary.holiday ?? 0,
        weekoff: summary.weekoff ?? 0,
        workedMinutes: summary.workedMinutes ?? 0,
        missedCheckouts: pay.missedCheckouts ?? 0,
        countedDays: pay.countedDays ?? 0,
        payableDays: pay.payableDays ?? 0,
        lopDays: pay.lopDays ?? 0,
        paidLeave: pay.paidLeave ?? 0,
        unpaidLeave: pay.unpaidLeave ?? 0,
        sandwichLop: pay.sandwichLop ?? 0,
        lopDates: pay.lopDates ?? [],
      },
      days,
      leaveRequests: leaveRequests.map((r) => ({
        id: r.id,
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
        fromDate: r.fromDate,
        toDate: r.toDate,
        purpose: r.purpose,
        location: r.location,
        status: r.status,
        rejectionReason: r.rejectionReason ?? r.revokeReason ?? null,
      })),
      regularizations: regularizations.map((r) => ({
        id: r.id,
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
        earnedDate: c.earnedDate,
        expiryDate: c.expiryDate,
        status: c.status,
      })),
      leaveBalances: balances,
      // null = caller can't view payroll; { generated: false } = not generated yet.
      payroll: !showPayroll
        ? null
        : payroll
          ? {
              generated: true,
              paidDays: num(payroll.paidDays),
              lopDays: num(payroll.lopDays),
              monthlyCtc: num(payroll.monthlyCtc),
              grossEarned: num(payroll.grossEarned),
              totalDeductions: num(payroll.totalDeductions),
              bonusTotal: num(payroll.bonusTotal),
              carryAdjustment: num(payroll.carryAdjustment),
              netPay: num(payroll.netPay),
              revision: payroll.revision,
              payslipReleased: !!payroll.payslipReleased,
            }
          : { generated: false },
    };
  });
}

module.exports = { buildMonthlyReport };
