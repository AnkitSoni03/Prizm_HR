'use strict';

const ExcelJS = require('exceljs');
const { leaveBalanceCells } = require('./reportLeaveBalanceCells');

// .xlsx version of employeePeriodReport.service.js::buildPeriodReport
// (built with includeDays). Sheets: Summary (one row per employee, period
// totals), Monthly Breakdown (employee x month), Daily Attendance (employee
// x day), then Leave / OD / Regularization / Comp-Off lists.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_LABEL = {
  present: 'Present',
  on_duty: 'On Duty',
  half_day: 'Half Day',
  leave: 'Leave',
  absent: 'Absent',
  holiday: 'Holiday',
  weekoff: 'Week Off',
};
const STATUS_FILL = {
  present: 'FFD1FAE5',
  on_duty: 'FFD1FAE5',
  half_day: 'FFFEF3C7',
  leave: 'FFDBEAFE',
  absent: 'FFFEE2E2',
  holiday: 'FFF3F4F6',
  weekoff: 'FFF3F4F6',
};
const HALF = { first_half: 'First half', second_half: 'Second half' };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };

function fmtDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(value);
}

function fmtTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}

const hours = (minutes) => (minutes == null ? '' : Math.round((minutes / 60) * 100) / 100);
const monthLabel = (year, month) => `${MONTHS[month - 1]} ${year}`;

function sheetWithHeader(workbook, name, columns) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

const IDENTITY = [
  { header: 'Employee Code', key: 'code', width: 14 },
  { header: 'Name', key: 'name', width: 22 },
];

function buildSummary(workbook, report, anyPayroll) {
  const sheet = sheetWithHeader(workbook, 'Summary', [
    ...IDENTITY,
    { header: 'Company', key: 'company', width: 20 },
    { header: 'Brand', key: 'brand', width: 16 },
    { header: 'Department', key: 'department', width: 16 },
    { header: 'Designation', key: 'designation', width: 16 },
    { header: 'Date of Joining', key: 'doj', width: 14 },
    { header: 'Last Working Day', key: 'lwd', width: 15 },
    { header: 'Days Counted', key: 'countedDays', width: 12 },
    { header: 'Payable Days', key: 'payableDays', width: 12 },
    { header: 'LOP Days', key: 'lopDays', width: 10 },
    { header: 'Present', key: 'present', width: 9 },
    { header: 'On Duty', key: 'onDuty', width: 9 },
    { header: 'Half Day', key: 'halfDay', width: 9 },
    { header: 'Leave', key: 'leave', width: 8 },
    { header: 'Paid Leave', key: 'paidLeave', width: 10 },
    { header: 'Unpaid Leave', key: 'unpaidLeave', width: 12 },
    { header: 'Absent', key: 'absent', width: 8 },
    { header: 'Holidays', key: 'holiday', width: 9 },
    { header: 'Week Offs', key: 'weekoff', width: 10 },
    { header: 'Sandwich LOP', key: 'sandwichLop', width: 12 },
    { header: 'Missed Checkouts', key: 'missedCheckouts', width: 14 },
    { header: 'Working Hours', key: 'hours', width: 13 },
    ...(anyPayroll ? [{ header: 'Net Pay (period)', key: 'netPay', width: 15 }] : []),
  ]);

  for (const r of report.rows) {
    const e = r.employee;
    const t = r.totals;
    const row = sheet.addRow({
      code: e.employeeCode ?? '',
      name: e.name ?? '',
      company: e.companyName ?? '',
      brand: e.brandName ?? '',
      department: e.departmentName ?? '',
      designation: e.designationName ?? '',
      doj: fmtDate(e.dateOfJoining),
      lwd: fmtDate(e.lastWorkingDate),
      countedDays: t.countedDays,
      payableDays: t.payableDays,
      lopDays: t.lopDays,
      present: t.present,
      onDuty: t.onDuty,
      halfDay: t.halfDay,
      leave: t.leave,
      paidLeave: t.paidLeave,
      unpaidLeave: t.unpaidLeave,
      absent: t.absent,
      holiday: t.holiday,
      weekoff: t.weekoff,
      sandwichLop: t.sandwichLop,
      missedCheckouts: t.missedCheckouts,
      hours: hours(t.workedMinutes),
      netPay: r.payrollVisible ? t.netPay : '',
    });
    row.getCell('payableDays').font = { bold: true, color: { argb: 'FF065F46' } };
    if (t.lopDays > 0) row.getCell('lopDays').font = { bold: true, color: { argb: 'FF991B1B' } };
  }

  const note = sheet.addRow([]);
  note.getCell(1).value = `Months: ${report.months.map((m) => monthLabel(m.year, m.month)).join(', ')} — figures up to ${fmtDate(report.asOf)}.`;
  note.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
}

function buildMonthly(workbook, report, anyPayroll) {
  const sheet = sheetWithHeader(workbook, 'Monthly Breakdown', [
    ...IDENTITY,
    { header: 'Month', key: 'month', width: 10 },
    { header: 'Payable Days', key: 'payableDays', width: 12 },
    { header: 'LOP Days', key: 'lopDays', width: 10 },
    { header: 'Present', key: 'present', width: 9 },
    { header: 'On Duty', key: 'onDuty', width: 9 },
    { header: 'Half Day', key: 'halfDay', width: 9 },
    { header: 'Leave', key: 'leave', width: 8 },
    { header: 'Absent', key: 'absent', width: 8 },
    { header: 'Holidays', key: 'holiday', width: 9 },
    { header: 'Week Offs', key: 'weekoff', width: 10 },
    { header: 'Missed Checkouts', key: 'missedCheckouts', width: 14 },
    { header: 'Working Hours', key: 'hours', width: 13 },
    { header: 'LOP Dates', key: 'lopDates', width: 36 },
    ...(anyPayroll
      ? [
          { header: 'Payroll Paid Days', key: 'paidDays', width: 14 },
          { header: 'Gross Earned', key: 'gross', width: 13 },
          { header: 'Deductions', key: 'deductions', width: 12 },
          { header: 'Net Pay', key: 'netPay', width: 12 },
        ]
      : []),
  ]);

  for (const r of report.rows) {
    for (const m of r.months) {
      if (!m.available) {
        sheet.addRow({ code: r.employee.employeeCode ?? '', name: r.employee.name ?? '', month: monthLabel(m.year, m.month), payableDays: '—' });
        continue;
      }
      const p = m.payroll;
      sheet.addRow({
        code: r.employee.employeeCode ?? '',
        name: r.employee.name ?? '',
        month: monthLabel(m.year, m.month),
        payableDays: m.payableDays,
        lopDays: m.lopDays,
        present: m.present,
        onDuty: m.onDuty,
        halfDay: m.halfDay,
        leave: m.leave,
        absent: m.absent,
        holiday: m.holiday,
        weekoff: m.weekoff,
        missedCheckouts: m.missedCheckouts,
        hours: hours(m.workedMinutes),
        lopDates: m.lopDates.join(', '),
        paidDays: p ? (p.generated ? p.paidDays : 'Not generated') : '',
        gross: p?.generated ? p.grossEarned : '',
        deductions: p?.generated ? p.totalDeductions : '',
        netPay: p?.generated ? p.netPay : '',
      });
    }
  }
}

function buildDaily(workbook, report) {
  const sheet = sheetWithHeader(workbook, 'Daily Attendance', [
    ...IDENTITY,
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Day', key: 'day', width: 6 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'Code', key: 'dayCode', width: 7 },
    { header: 'Check In', key: 'in', width: 10 },
    { header: 'Check Out', key: 'out', width: 10 },
    { header: 'Working Hrs', key: 'hours', width: 12 },
    { header: 'Hours Basis', key: 'basis', width: 13 },
    { header: 'Note', key: 'note', width: 16 },
  ]);
  for (const r of report.rows) {
    for (const d of r.days ?? []) {
      const row = sheet.addRow({
        code: r.employee.employeeCode ?? '',
        name: r.employee.name ?? '',
        date: fmtDate(d.date),
        day: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }),
        status: STATUS_LABEL[d.status] ?? d.status,
        dayCode: d.code ?? '',
        in: fmtTime(d.checkIn),
        out: fmtTime(d.checkOut),
        hours: hours(d.workedMinutes),
        basis: d.workedMinutesBasis === 'shift' ? 'Shift hours' : d.workedMinutesBasis === 'actual' ? 'Actual' : '',
        note: d.checkoutMissed ? 'Missed checkout' : '',
      });
      const fill = STATUS_FILL[d.status];
      if (fill) row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    }
  }
}

function buildList(workbook, name, columns, rows) {
  const sheet = sheetWithHeader(workbook, name, [...IDENTITY, ...columns]);
  if (!rows.length) sheet.addRow(['None']);
  rows.forEach((r) => sheet.addRow(r));
}

async function writeEmployeePeriodReportXlsx(res, report) {
  const workbook = new ExcelJS.Workbook();
  const anyPayroll = report.rows.some((r) => r.payrollVisible);

  buildSummary(workbook, report, anyPayroll);
  buildMonthly(workbook, report, anyPayroll);
  buildDaily(workbook, report);
  const balanceSheet = sheetWithHeader(workbook, 'Leave Balances', [
    ...IDENTITY,
    { header: 'Leave Type', key: 'type', width: 22 },
    { header: 'Assigned', key: 'assigned', width: 10 },
    { header: 'Carried Fwd', key: 'cf', width: 11 },
    { header: 'Used', key: 'used', width: 8 },
    { header: 'Balance', key: 'balance', width: 10 },
    { header: 'Note', key: 'note', width: 34 },
  ]);
  for (const r of report.rows) {
    if (!(r.leaveBalances ?? []).length) {
      balanceSheet.addRow([r.employee.employeeCode ?? '', r.employee.name ?? '', 'No leave types assigned']);
      continue;
    }
    for (const b of r.leaveBalances) {
      const row = balanceSheet.addRow([r.employee.employeeCode ?? '', r.employee.name ?? '', ...leaveBalanceCells(b, fmtDate)]);
      row.getCell(7).font = { bold: true };
    }
  }
  const balanceNote = balanceSheet.addRow([]);
  balanceNote.getCell(1).value = 'Balances are as of today (current leave period), not as of the picked months.';
  balanceNote.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
  buildList(
    workbook,
    'Leave Requests',
    [
      { header: 'Leave Type', key: 'type', width: 20 },
      { header: 'From', key: 'from', width: 12 },
      { header: 'To', key: 'to', width: 12 },
      { header: 'Half Day', key: 'half', width: 12 },
      { header: 'Days', key: 'days', width: 7 },
      { header: 'Status', key: 'status', width: 11 },
      { header: 'Reason', key: 'reason', width: 28 },
      { header: 'Reject / Revert Reason', key: 'reject', width: 28 },
    ],
    report.leaveRequests.map((r) => ({
      code: r.employeeCode ?? '',
      name: r.employeeName,
      type: `${r.leaveTypeName}${r.isPaid ? '' : ' (unpaid)'}`,
      from: fmtDate(r.fromDate),
      to: fmtDate(r.toDate),
      half: r.halfDaySession ? HALF[r.halfDaySession] : '',
      days: r.days,
      status: r.status,
      reason: r.reason ?? '',
      reject: r.rejectionReason ?? '',
    }))
  );
  buildList(
    workbook,
    'OD Requests',
    [
      { header: 'Purpose', key: 'purpose', width: 24 },
      { header: 'From', key: 'from', width: 12 },
      { header: 'To', key: 'to', width: 12 },
      { header: 'Location', key: 'location', width: 18 },
      { header: 'Status', key: 'status', width: 11 },
      { header: 'Reject / Revert Reason', key: 'reject', width: 28 },
    ],
    report.odRequests.map((r) => ({
      code: r.employeeCode ?? '',
      name: r.employeeName,
      purpose: r.purpose,
      from: fmtDate(r.fromDate),
      to: fmtDate(r.toDate),
      location: r.location ?? '',
      status: r.status,
      reject: r.rejectionReason ?? '',
    }))
  );
  buildList(
    workbook,
    'Regularizations',
    [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Requested', key: 'requested', width: 12 },
      { header: 'Check In', key: 'in', width: 10 },
      { header: 'Check Out', key: 'out', width: 10 },
      { header: 'Status', key: 'status', width: 11 },
      { header: 'Reason', key: 'reason', width: 28 },
      { header: 'Reject / Revert Reason', key: 'reject', width: 28 },
    ],
    report.regularizations.map((r) => ({
      code: r.employeeCode ?? '',
      name: r.employeeName,
      date: fmtDate(r.date),
      requested: STATUS_LABEL[r.requestedStatus] ?? r.requestedStatus,
      in: fmtTime(r.requestedCheckIn),
      out: fmtTime(r.requestedCheckOut),
      status: r.status,
      reason: r.reason ?? '',
      reject: r.rejectionReason ?? '',
    }))
  );
  buildList(
    workbook,
    'Comp-Off',
    [
      { header: 'Earned On', key: 'earned', width: 12 },
      { header: 'Expires', key: 'expires', width: 12 },
      { header: 'Status', key: 'status', width: 11 },
    ],
    report.compOffCredits.map((c) => ({
      code: c.employeeCode ?? '',
      name: c.employeeName,
      earned: fmtDate(c.earnedDate),
      expires: fmtDate(c.expiryDate),
      status: c.status,
    }))
  );

  const filename = `employee-report-${report.from}${report.to !== report.from ? `-to-${report.to}` : ''}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { writeEmployeePeriodReportXlsx };
