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

// Every code the board can show, with the plain-English meaning behind it —
// written into a "Status Code Legend" block under the grid so the sheet is
// self-explanatory to anyone opening it outside the app (multiple leave
// types share the 'leave' color, so listing each by name here — not just
// the color — is the part a bare color key can't convey).
const LEGEND_ITEMS = [
  { code: 'P', label: 'Present', category: 'present' },
  { code: 'A', label: 'Absent', category: 'absent' },
  { code: 'HD', label: 'Half Day', category: 'half_day' },
  { code: 'AL', label: 'Annual Leave', category: 'leave' },
  { code: 'SHL', label: 'Short Leave', category: 'leave' },
  { code: 'SPL', label: 'Special Leave', category: 'leave' },
  { code: 'UPHD', label: 'Unpaid Half Day', category: 'leave' },
  { code: 'UL', label: 'Unpaid Leave', category: 'leave' },
  { code: 'MTL', label: 'Maternity Leave', category: 'leave' },
  { code: 'PTL', label: 'Paternity Leave', category: 'leave' },
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

function formatTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function punchRangeText(day) {
  if (!day.checkIn && !day.checkOut) return '';
  return `${day.checkIn ? formatTime(day.checkIn) : '—'}-${day.checkOut ? formatTime(day.checkOut) : '—'}`;
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
// board's "Status Codes" card shows, so the sheet is self-explanatory
// without the app open next to it.
function writeLegend(sheet) {
  const startRow = sheet.lastRow.number + 2;
  const titleCell = sheet.getCell(`A${startRow}`);
  titleCell.value = 'Status Code Legend';
  titleCell.font = { bold: true, size: 12 };

  LEGEND_ITEMS.forEach((item, i) => {
    const r = startRow + 1 + i;
    const codeCell = sheet.getCell(`A${r}`);
    codeCell.value = item.code;
    colorCell(codeCell, item.category);
    sheet.getCell(`B${r}`).value = item.label;
  });
}

// Main "Attendance Board" sheet — one row per employee, one column per day
// (status code, colored), followed by day-count summary columns
// (present/absent/half-day/leave/on-duty/holiday/week-off totals for the
// month) so payroll doesn't need to count cells by hand. The legend block
// is written underneath the data.
function buildBoardSheet(workbook, board) {
  const sheet = workbook.addWorksheet(`${MONTH_LABELS[board.month - 1]} ${board.year}`);

  sheet.columns = [
    { header: 'Employee Code', key: 'employeeCode', width: 16 },
    { header: 'Name', key: 'name', width: 24 },
    ...Array.from({ length: board.daysInMonth }, (_, i) => ({
      header: String(i + 1),
      key: `d${i + 1}`,
      width: 5,
    })),
    ...SUMMARY_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 12 })),
    { header: 'Worked Hours', key: 'workedHours', width: 13 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

  for (const row of board.rows) {
    const record = { employeeCode: row.employeeCode, name: row.name ?? '' };
    row.days.forEach((day) => {
      record[`d${day.day}`] = day.code ?? '';
    });
    SUMMARY_COLUMNS.forEach((c) => {
      record[c.key] = row.summary[c.key] ?? 0;
    });
    record.workedHours = Math.round((row.summary.workedMinutes / 60) * 10) / 10;
    const sheetRow = sheet.addRow(record);

    row.days.forEach((day, idx) => {
      colorCell(sheetRow.getCell(idx + 3), day.category); // 1: code, 2: name, 3+: days
    });
  }

  writeLegend(sheet);
  return sheet;
}

// Second sheet, purely for payroll reference — same grid shape, but each
// day cell shows the actual check-in/check-out punch (blank for a day with
// no real punch, e.g. absent/leave/holiday/week-off), colored the same way
// as the main sheet so the two stay easy to cross-reference.
function buildPunchSheet(workbook, board) {
  const sheet = workbook.addWorksheet('Check-In & Check-Out');

  sheet.columns = [
    { header: 'Employee Code', key: 'employeeCode', width: 16 },
    { header: 'Name', key: 'name', width: 24 },
    ...Array.from({ length: board.daysInMonth }, (_, i) => ({
      header: String(i + 1),
      key: `d${i + 1}`,
      width: 13,
    })),
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

  for (const row of board.rows) {
    const record = { employeeCode: row.employeeCode, name: row.name ?? '' };
    row.days.forEach((day) => {
      record[`d${day.day}`] = punchRangeText(day);
    });
    const sheetRow = sheet.addRow(record);

    row.days.forEach((day, idx) => {
      colorCell(sheetRow.getCell(idx + 3), day.category);
    });
  }
}

// Streams a colorful .xlsx version of listAttendanceBoard's result straight
// to the HTTP response: sheet 1 is the code grid + a summary + a legend,
// sheet 2 is the same grid with actual check-in/check-out punch times
// instead of codes, for salary/payroll reference. Deliberately includes
// every employee the board query returned, not just whatever the caller's
// on-page search box currently narrows to (the export is a full record, not
// a copy of the current view).
async function writeAttendanceBoardXlsx(res, board) {
  const workbook = new ExcelJS.Workbook();
  buildBoardSheet(workbook, board);
  buildPunchSheet(workbook, board);

  const filename = `attendance-board-${board.year}-${String(board.month).padStart(2, '0')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { writeAttendanceBoardXlsx };
