'use strict';

const ExcelJS = require('exceljs');

// .xlsx version of employeeMonthlyReport.service.js::buildMonthlyReport —
// three sheets: Summary (employee, totals, payroll, leave balances), Daily
// Attendance, and Requests (leave / OD / regularization / comp-off).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

function fmtHours(minutes) {
  if (minutes == null) return '';
  return Math.round((minutes / 60) * 100) / 100;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function titleRow(sheet, text) {
  const row = sheet.addRow([text]);
  row.font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };
  return row;
}

function headerRow(sheet, values) {
  const row = sheet.addRow(values);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  return row;
}

function pairs(sheet, items) {
  for (const [label, value] of items) {
    const row = sheet.addRow([label, value ?? '—']);
    row.getCell(1).font = { color: { argb: 'FF6B7280' } };
  }
}

function buildSummarySheet(workbook, report) {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [{ width: 26 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }];
  const e = report.employee;

  titleRow(sheet, `Monthly Report — ${e.name ?? ''} (${e.employeeCode ?? 'no code'}) — ${MONTHS[report.month - 1]} ${report.year}`);
  sheet.addRow([`Figures up to ${fmtDate(report.asOf)}`]).font = { italic: true, color: { argb: 'FF6B7280' } };
  sheet.addRow([]);

  titleRow(sheet, 'Employee');
  pairs(sheet, [
    ['Company', e.companyName],
    ['Brand', e.brandName],
    ['Department', e.departmentName],
    ['Designation', e.designationName],
    ['Manager', e.managerName],
    ['Roster', e.rosterName],
    ['Shift', [e.shiftName, e.shiftTime].filter(Boolean).join(' ') || null],
    ['Employment Type', e.employmentType ? e.employmentType.replace('_', ' ') : null],
    ['Status', e.status],
    ['Date of Joining', fmtDate(e.dateOfJoining)],
    ['Last Working Day', e.lastWorkingDate ? fmtDate(e.lastWorkingDate) : null],
  ]);
  sheet.addRow([]);

  const s = report.summary;
  titleRow(sheet, 'Attendance');
  pairs(sheet, [
    ['Present', s.present],
    ['On Duty', s.onDuty],
    ['Half Day', s.halfDay],
    ['Leave', s.leave],
    ['Absent', s.absent],
    ['Holidays', s.holiday],
    ['Week Offs', s.weekoff],
    ['Missed Checkouts', s.missedCheckouts],
    ['Total Working Hours', fmtHours(s.workedMinutes)],
  ]);
  sheet.addRow([]);

  titleRow(sheet, 'Payable Days');
  pairs(sheet, [
    ['Days Counted', round2(s.countedDays)],
    ['Payable Days', round2(s.payableDays)],
    ['LOP Days', round2(s.lopDays)],
    ['Paid Leave', round2(s.paidLeave)],
    ['Unpaid Leave', round2(s.unpaidLeave)],
    ['Sandwich LOP', round2(s.sandwichLop)],
    ['LOP Dates', s.lopDates.length ? s.lopDates.join(', ') : 'None'],
  ]);

  if (report.payroll) {
    sheet.addRow([]);
    titleRow(sheet, 'Payroll');
    const p = report.payroll;
    if (!p.generated) {
      sheet.addRow(['Not generated for this month yet']);
    } else {
      pairs(sheet, [
        ['Paid Days', p.paidDays],
        ['LOP Days', p.lopDays],
        ['Monthly CTC', p.monthlyCtc],
        ['Gross Earned', p.grossEarned],
        ['Deductions', p.totalDeductions],
        ['Bonuses', p.bonusTotal],
        ['Arrears / Recovery', p.carryAdjustment],
        ['Net Pay', p.netPay],
        ['Payslip Shared', p.payslipReleased ? 'Yes' : 'No'],
      ]);
    }
  }

  sheet.addRow([]);
  titleRow(sheet, 'Leave Balances');
  if (!report.leaveBalances.length) {
    sheet.addRow(['No leave balances']);
  } else {
    headerRow(sheet, ['Leave Type', 'Period', 'Carried Fwd', 'Allotted', 'Used', 'Balance']);
    for (const b of report.leaveBalances) {
      sheet.addRow([
        b.leaveTypeName,
        `${fmtDate(b.periodStart)} – ${b.periodEnd ? fmtDate(b.periodEnd) : 'open'}`,
        b.carriedForward,
        b.allotted,
        b.used,
        b.balance,
      ]);
    }
  }
}

function buildDailySheet(workbook, report) {
  const sheet = workbook.addWorksheet('Daily Attendance');
  sheet.columns = [
    { header: 'Date', width: 12 },
    { header: 'Day', width: 6 },
    { header: 'Status', width: 12 },
    { header: 'Leave', width: 24 },
    { header: 'Check In', width: 10 },
    { header: 'Check Out', width: 10 },
    { header: 'Working Hrs', width: 12 },
    { header: 'Hours Basis', width: 14 },
    { header: 'Note', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const d of report.days) {
    const weekday = new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
    const leave = d.leaveTypeName
      ? `${d.leaveTypeName}${d.leaveHalfDaySession ? ` (${HALF[d.leaveHalfDaySession]})` : ''}`
      : '';
    const row = sheet.addRow([
      fmtDate(d.date),
      weekday,
      d.status ? STATUS_LABEL[d.status] ?? d.status : '—',
      leave,
      fmtTime(d.checkIn),
      fmtTime(d.checkOut),
      fmtHours(d.workedMinutes),
      d.workedMinutesBasis === 'shift' ? 'Shift hours' : d.workedMinutesBasis === 'actual' ? 'Actual' : '',
      d.checkoutMissed ? 'Missed checkout' : d.status ? '' : 'Not joined / upcoming',
    ]);
    const fill = d.status ? STATUS_FILL[d.status] : null;
    if (fill) row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  }

  const total = sheet.addRow(['Total', '', '', '', '', '', fmtHours(report.summary.workedMinutes)]);
  total.font = { bold: true };
}

function section(sheet, title, headers, rows) {
  titleRow(sheet, title);
  if (!rows.length) {
    sheet.addRow(['None']);
  } else {
    headerRow(sheet, headers);
    rows.forEach((r) => sheet.addRow(r));
  }
  sheet.addRow([]);
}

function buildRequestsSheet(workbook, report) {
  const sheet = workbook.addWorksheet('Requests');
  sheet.columns = [{ width: 22 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 30 }, { width: 30 }];

  section(
    sheet,
    'Leave Requests',
    ['Leave Type', 'From', 'To', 'Half Day', 'Days', 'Status', 'Reason', 'Reject / Revert Reason'],
    report.leaveRequests.map((r) => [
      `${r.leaveTypeName}${r.isPaid ? '' : ' (unpaid)'}`,
      fmtDate(r.fromDate),
      fmtDate(r.toDate),
      r.halfDaySession ? HALF[r.halfDaySession] : '',
      r.days,
      r.status,
      r.reason ?? '',
      r.rejectionReason ?? '',
    ])
  );
  section(
    sheet,
    'On Duty (OD) Requests',
    ['Purpose', 'From', 'To', 'Location', '', 'Status', '', 'Reject / Revert Reason'],
    report.odRequests.map((r) => [r.purpose, fmtDate(r.fromDate), fmtDate(r.toDate), r.location ?? '', '', r.status, '', r.rejectionReason ?? ''])
  );
  section(
    sheet,
    'Attendance Regularizations',
    ['Date', 'Requested', 'Check In', 'Check Out', '', 'Status', 'Reason', 'Reject / Revert Reason'],
    report.regularizations.map((r) => [
      fmtDate(r.date),
      STATUS_LABEL[r.requestedStatus] ?? r.requestedStatus,
      fmtTime(r.requestedCheckIn),
      fmtTime(r.requestedCheckOut),
      '',
      r.status,
      r.reason ?? '',
      r.rejectionReason ?? '',
    ])
  );
  section(
    sheet,
    'Comp-Off Credits Earned',
    ['Earned On', 'Expires', '', '', '', 'Status'],
    report.compOffCredits.map((c) => [fmtDate(c.earnedDate), fmtDate(c.expiryDate), '', '', '', c.status])
  );
}

async function writeEmployeeMonthlyReportXlsx(res, report) {
  const workbook = new ExcelJS.Workbook();
  buildSummarySheet(workbook, report);
  buildDailySheet(workbook, report);
  buildRequestsSheet(workbook, report);

  const code = String(report.employee.employeeCode || report.employee.id).replace(/[^A-Za-z0-9_-]/g, '-');
  const filename = `monthly-report-${code}-${report.year}-${String(report.month).padStart(2, '0')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { writeEmployeeMonthlyReportXlsx };
