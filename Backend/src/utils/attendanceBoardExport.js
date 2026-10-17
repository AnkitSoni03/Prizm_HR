'use strict';

const ExcelJS = require('exceljs');

// Fill/font colors per attendance-board cell category — a fixed, hand-picked
// palette (Excel has no concept of the frontend's Tailwind tokens) chosen to
// read the same way the on-screen board does: pastel fill, saturated text.
// Keep roughly in sync with AttendanceBoardPage.tsx's CATEGORY_STYLE if that
// palette ever changes. A day with no category (not yet joined / upcoming)
// gets no fill at all.
const CATEGORY_COLORS = {
  present: { fill: 'FFD1FAE5', font: 'FF065F46' },
  on_duty: { fill: 'FFD1FAE5', font: 'FF065F46' },
  half_day: { fill: 'FFFEF3C7', font: 'FF92400E' },
  leave: { fill: 'FFDBEAFE', font: 'FF1E40AF' },
  absent: { fill: 'FFFEE2E2', font: 'FF991B1B' },
  holiday: { fill: 'FFF3F4F6', font: 'FF4B5563' },
  weekoff: { fill: 'FFF3F4F6', font: 'FF6B7280' },
};

// The fixed, non-leave codes the board can show — always relevant
// regardless of which leave types a company actually defines. The leave
// codes (AL/SHL/CO/... or a custom type's own code) are NOT hardcoded here
// — see writeLegend below, which appends only board.leaveLegend, the exact
// set of leave types that actually appear on THIS board (this company,
// this month), instead of every leave type this codebase merely knows how
// to display.
const FIXED_LEGEND_ITEMS = [
  { code: 'P', label: 'Present', category: 'present' },
  { code: 'A', label: 'Absent', category: 'absent' },
  { code: 'HD', label: 'Half Day', category: 'half_day' },
  { code: 'OD', label: 'On Duty', category: 'on_duty' },
  { code: 'H', label: 'Holiday', category: 'holiday' },
  { code: 'W', label: 'Weekend / Week Off', category: 'weekoff' },
  { code: '(blank)', label: 'Not yet joined / upcoming day', category: null },
];

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SUMMARY_COLUMNS = [
  { key: 'present', header: 'Present Days' },
  { key: 'absent', header: 'Absent Days' },
  { key: 'half_day', header: 'Half Days' },
  { key: 'leave', header: 'Leave Days' },
  { key: 'on_duty', header: 'On Duty Days' },
  { key: 'holiday', header: 'Holidays' },
  { key: 'weekoff', header: 'Week Offs' },
];

// Payroll cross-check columns, read from row.pay (attendance.service.js
// listAttendanceBoard — same day rules as payrollEngine.js::classifyDays).
// Highlighted ones are the figures to compare with payroll.
const PAY_COLUMNS = [
  { key: 'countedDays', header: 'Days Counted', width: 12 },
  { key: 'payableDays', header: 'Payable Days', width: 12, highlight: true },
  { key: 'lopDays', header: 'LOP Days', width: 10, highlight: true },
  { key: 'paidLeave', header: 'Paid Leave', width: 11 },
  { key: 'unpaidLeave', header: 'Unpaid Leave', width: 12 },
  { key: 'sandwichLop', header: 'Sandwich LOP', width: 12 },
  { key: 'missedCheckouts', header: 'Missed Checkouts', width: 14 },
  { key: 'payrollPaidDays', header: 'Payroll Paid Days', width: 14 },
  { key: 'payrollDiff', header: 'Diff vs Payroll', width: 13 },
  { key: 'lopDates', header: 'LOP Dates (day + reason)', width: 40 },
];

const round2 = (n) => Math.round(n * 100) / 100;

// One employee occupies this many stacked rows in the combined sheet —
// Status / Check-In & Check-Out / Hours Worked — see buildAttendanceSheet.
const ROWS_PER_EMPLOYEE = 3;

// A vertical line down every column boundary (light) so each day's 3 stacked
// cells (Status/Check-In-Out/Hours) read as one boxed unit, framed top and
// bottom by GROUP_SEPARATOR_BORDER — no border is ever drawn BETWEEN a
// day's own 3 rows, so the box reads as continuous/merged even though the
// cells aren't an actual Excel merge (unlike Employee Code/Name, which are).
const VERTICAL_BORDER = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const GROUP_SEPARATOR_BORDER = { style: 'medium', color: { argb: 'FF94A3B8' } };

function formatTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' (same as the app's formatDisplayDate).
function formatDate(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(value);
}

function punchRangeText(day) {
  if (!day.checkIn && !day.checkOut) return '';
  return `${day.checkIn ? formatTime(day.checkIn) : '—'}-${day.checkOut ? formatTime(day.checkOut) : '—'}`;
}

// Working hours that day, from the service's workedMinutes
// (attendance.service.js::workedMinutesFor): actual punches, or the shift's
// length for an On Duty / missed-checkout day. null for absent / leave /
// holiday / week-off / a still-open check-in. Rounded to 2 decimals so it
// sums cleanly in Excel.
function dailyWorkedHours(day) {
  if (day.workedMinutes == null) return null;
  return Math.round((day.workedMinutes / 60) * 100) / 100;
}

function colorCell(cell, category) {
  const colors = category ? CATEGORY_COLORS[category] : null;
  if (!colors) return;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.fill } };
  cell.font = { color: { argb: colors.font }, bold: true };
  cell.alignment = { horizontal: 'center' };
}

// Writes the "Status Code Legend" block a couple of rows below whatever the
// caller has already written to `sheet` — same legend content the on-screen
// board's "Status Codes" card shows (fixed statuses + only the leave types
// that actually appear on this board), so the sheet is self-explanatory
// without the app open next to it.
function writeLegend(sheet, leaveLegend, dataEnd) {
  const items = [
    ...FIXED_LEGEND_ITEMS,
    ...leaveLegend.map((lt) => ({ code: lt.code, label: lt.name, category: 'leave' })),
  ];

  const startRow = sheet.lastRow.number + 2;
  const titleCell = sheet.getCell(`A${startRow}`);
  titleCell.value = 'Status Code Legend';
  titleCell.font = { bold: true, size: 12 };

  items.forEach((item, i) => {
    const r = startRow + 1 + i;
    const codeCell = sheet.getCell(`A${r}`);
    codeCell.value = item.code;
    colorCell(codeCell, item.category);
    sheet.getCell(`B${r}`).value = item.label;
  });

  const notes = [
    `Days counted up to ${formatDate(dataEnd)} (from joining, to the last working day if resigned).`,
    'Payable Days = present, on duty, half day, paid leave, holidays, week offs, and sandwich days covered by leave balance.',
    'LOP Days = absent working days, unpaid leave, and sandwich days with no leave balance left. "(half)" = half a day.',
    'Hours Worked in italics = the assigned shift length (On Duty day, or a missed checkout). Punch times are not filled in.',
    'Payroll Paid Days = the generated payroll for this month. A non-zero Diff means attendance changed after payroll was generated or still needs recalculation.',
  ];
  const notesStart = sheet.lastRow.number + 2;
  sheet.getCell(`A${notesStart}`).value = 'Payable Days';
  sheet.getCell(`A${notesStart}`).font = { bold: true, size: 12 };
  notes.forEach((note, i) => {
    sheet.getCell(`A${notesStart + 1 + i}`).value = note;
  });
}

// Single combined "Attendance Board" sheet — no tabs to switch between.
// Every employee occupies 3 stacked rows under the same day columns
// (labeled in column C): Status code, Check-In & Check-Out punch time, and
// Hours Worked that day — so a day's full picture (what happened, when they
// punched, how long they worked) reads straight across in one place. The
// Employee Code/Name cells are merged down the employee's 3 rows. Monthly
// day-count totals sit on the Status row, the monthly Total Hours on the
// Hours Worked row, and a thin border under each employee separates them
// from the next. The legend block is written underneath the whole grid.
function buildAttendanceSheet(workbook, board) {
  const sheet = workbook.addWorksheet(`${MONTH_LABELS[board.month - 1]} ${board.year}`);

  // Company/Brand columns only when the board actually spans more than one
  // (a Group Admin's group-wide export, or a multi-brand company) — a
  // single-company, brand-less export keeps its original layout.
  const showCompany = new Set(board.rows.map((r) => r.companyId)).size > 1;
  const showBrand = board.rows.some((r) => r.brandName);
  const identityColumns = [
    { header: 'Employee Code', key: 'employeeCode', width: 16 },
    { header: 'Name', key: 'name', width: 22 },
    ...(showCompany ? [{ header: 'Company', key: 'companyName', width: 22 }] : []),
    ...(showBrand ? [{ header: 'Brand', key: 'brandName', width: 18 }] : []),
    { header: 'Date of Joining', key: 'dateOfJoining', width: 14 },
    { header: 'Last Working Day', key: 'lastWorkingDate', width: 15 },
  ];
  const detailCol = identityColumns.length + 1;

  sheet.columns = [
    ...identityColumns,
    { header: 'Detail', key: 'rowType', width: 20 },
    ...Array.from({ length: board.daysInMonth }, (_, i) => ({
      header: String(i + 1),
      key: `d${i + 1}`,
      width: 11,
    })),
    ...SUMMARY_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 12 })),
    { header: 'Total Hours', key: 'totalHours', width: 13 },
    ...PAY_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })),
  ];
  sheet.getRow(1).font = { bold: true };
  const highlightCols = PAY_COLUMNS.filter((c) => c.highlight).map((c) => sheet.getColumn(c.key).number);
  const diffCol = sheet.getColumn('payrollDiff').number;
  const lopDatesCol = sheet.getColumn('lopDates').number;
  sheet.views = [{ state: 'frozen', xSplit: detailCol, ySplit: 1 }];

  // Vertical column lines start at the header row too, so they run
  // unbroken down into the data instead of only appearing partway down.
  for (let c = 1; c <= sheet.columnCount; c++) {
    sheet.getRow(1).getCell(c).border = { left: VERTICAL_BORDER, right: VERTICAL_BORDER, bottom: GROUP_SEPARATOR_BORDER };
  }

  const firstDayCol = detailCol + 1; // identity columns, row label, then days

  // Company > Brand sections: rows arrive sorted company > brand > name
  // (attendance.service.js ORG_ORDER). When the export spans more than one
  // section (a Group Admin's group-wide download, or a multi-brand
  // company), each new section gets a blank spacer row plus a bold
  // "Company › Brand" heading row, so different companies/brands never run
  // into each other. A single-section export keeps its original layout.
  const sectionKey = (r) => `${r.companyId}:${r.brandId ?? ''}`;
  const sectioned = new Set(board.rows.map(sectionKey)).size > 1;
  let currentSection = null;

  for (const row of board.rows) {
    if (sectioned && sectionKey(row) !== currentSection) {
      if (currentSection !== null) sheet.addRow([]);
      currentSection = sectionKey(row);
      const sectionEmployees = board.rows.filter((r) => sectionKey(r) === currentSection).length;
      const label = [row.companyName, row.brandName].filter(Boolean).join(' › ');
      const headingRow = sheet.addRow([`${label || '—'}  (${sectionEmployees} employee${sectionEmployees === 1 ? '' : 's'})`]);
      sheet.mergeCells(headingRow.number, 1, headingRow.number, sheet.columnCount);
      const headingCell = headingRow.getCell(1);
      headingCell.font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };
      headingCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
      headingCell.alignment = { vertical: 'middle', horizontal: 'left' };
      headingCell.border = { bottom: GROUP_SEPARATOR_BORDER };
      headingRow.height = 20;
    }

    const statusRecord = {
      employeeCode: row.employeeCode,
      name: row.name ?? '',
      companyName: row.companyName ?? '',
      brandName: row.brandName ?? '',
      rowType: 'Status',
    };
    const timeRecord = { rowType: 'Check-In / Check-Out' };
    const hoursRecord = { rowType: 'Hours Worked' };

    let totalHours = 0;
    row.days.forEach((day) => {
      statusRecord[`d${day.day}`] = day.code ?? '';
      timeRecord[`d${day.day}`] = punchRangeText(day);
      const hours = dailyWorkedHours(day);
      hoursRecord[`d${day.day}`] = hours ?? '';
      if (hours) totalHours += hours;
    });
    SUMMARY_COLUMNS.forEach((c) => {
      statusRecord[c.key] = row.summary[c.key] ?? 0;
    });
    statusRecord.dateOfJoining = row.dateOfJoining ? formatDate(row.dateOfJoining) : '';
    statusRecord.lastWorkingDate = row.lastWorkingDate ? formatDate(row.lastWorkingDate) : '';
    const pay = row.pay ?? {};
    for (const c of PAY_COLUMNS) {
      if (c.key === 'lopDates') statusRecord.lopDates = (pay.lopDates ?? []).join(', ');
      else if (c.key === 'payrollPaidDays') statusRecord.payrollPaidDays = pay.payrollPaidDays ?? 'Not generated';
      else if (c.key === 'payrollDiff') {
        statusRecord.payrollDiff = pay.payrollPaidDays == null ? '' : round2(pay.payableDays - pay.payrollPaidDays);
      } else statusRecord[c.key] = round2(pay[c.key] ?? 0);
    }
    hoursRecord.totalHours = Math.round(totalHours * 100) / 100;

    const startRowNumber = sheet.lastRow ? sheet.lastRow.number + 1 : 2;
    const statusRow = sheet.addRow(statusRecord);
    const timeRow = sheet.addRow(timeRecord);
    const hoursRow = sheet.addRow(hoursRecord);

    for (let c = 1; c < detailCol; c++) {
      sheet.mergeCells(startRowNumber, c, startRowNumber + ROWS_PER_EMPLOYEE - 1, c);
      sheet.getCell(startRowNumber, c).alignment = { vertical: 'middle', horizontal: 'left' };
      sheet.getCell(startRowNumber, c).font = { bold: c <= 2 };
    }

    [statusRow, timeRow, hoursRow].forEach((r) => {
      r.getCell(detailCol).font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
    });

    row.days.forEach((day, idx) => {
      const col = firstDayCol + idx;
      colorCell(statusRow.getCell(col), day.category);
      colorCell(timeRow.getCell(col), day.category);
      colorCell(hoursRow.getCell(col), day.category);
      if (day.workedMinutesBasis === 'shift') {
        const cell = hoursRow.getCell(col);
        cell.font = { ...(cell.font || {}), italic: true };
        cell.note = 'Shift hours (On Duty / missed checkout)';
      }
    });

    // Vertical border down every column (framing each day's 3-cell box —
    // see VERTICAL_BORDER above), plus a bolder line under the employee's
    // last row so one employee's whole block reads as visually distinct
    // from the next going down a long sheet.
    for (let c = 1; c <= sheet.columnCount; c++) {
      statusRow.getCell(c).border = { left: VERTICAL_BORDER, right: VERTICAL_BORDER };
      timeRow.getCell(c).border = { left: VERTICAL_BORDER, right: VERTICAL_BORDER };
      hoursRow.getCell(c).border = { left: VERTICAL_BORDER, right: VERTICAL_BORDER, bottom: GROUP_SEPARATOR_BORDER };
    }

    // Payable / LOP stand out; a non-zero difference from payroll is red;
    // LOP dates wrap inside their box.
    for (const c of highlightCols) {
      const cell = statusRow.getCell(c);
      cell.font = { bold: true, color: { argb: c === highlightCols[0] ? 'FF065F46' : 'FF991B1B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c === highlightCols[0] ? 'FFD1FAE5' : 'FFFEE2E2' } };
    }
    const diffCell = statusRow.getCell(diffCol);
    if (typeof diffCell.value === 'number' && diffCell.value !== 0) {
      diffCell.font = { bold: true, color: { argb: 'FFB91C1C' } };
      diffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    }
    sheet.mergeCells(statusRow.number, lopDatesCol, hoursRow.number, lopDatesCol);
    statusRow.getCell(lopDatesCol).alignment = { wrapText: true, vertical: 'top' };
  }

  writeLegend(sheet, board.leaveLegend ?? [], board.dataEnd);
  return sheet;
}

// Streams a colorful .xlsx version of listAttendanceBoard's result straight
// to the HTTP response — a single sheet, no tabs: status codes, check-in/
// check-out punch times, and daily worked hours for every employee, plus a
// monthly summary and a legend, all for salary/payroll reference.
// Deliberately includes every employee the board query returned, not just
// whatever the caller's on-page search box currently narrows to (the export
// is a full record, not a copy of the current view).
async function writeAttendanceBoardXlsx(res, board) {
  const workbook = new ExcelJS.Workbook();
  buildAttendanceSheet(workbook, board);

  const filename = `attendance-board-${board.year}-${String(board.month).padStart(2, '0')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { writeAttendanceBoardXlsx };
