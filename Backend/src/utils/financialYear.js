'use strict';

// India's Financial Year: April(4) of fyStartYear through March(3) of
// fyStartYear + 1. Pure helpers, no DB — consumed by TDS's annualized
// projection in payrollRun.service.js.

// calendarMonth is 1-12. April+ belongs to the FY starting this calendar
// year; Jan-Mar belongs to the FY that started the previous calendar year.
function getFinancialYearStart(calendarYear, calendarMonth) {
  return calendarMonth >= 4 ? calendarYear : calendarYear - 1;
}

// Months remaining in the FY, counting the given month itself, through
// March inclusive. April -> 12 (full year), March -> 1 (last month).
function getRemainingMonthsInFY(calendarMonth) {
  return calendarMonth >= 4 ? 12 - calendarMonth + 4 : 4 - calendarMonth;
}

function monthSortKey(year, month) {
  return year * 12 + month;
}

// True only when (year, month) belongs to the SAME financial year as
// (refYear, refMonth) AND is chronologically before it — used to filter a
// company's prior payroll runs down to "this FY's YTD so far". A plain
// chronological "before" check alone would be wrong here: it would pull a
// PRIOR financial year's payslips into a new FY's YTD-TDS reconstruction,
// silently understating tax at the start of every new financial year.
function isBeforeInFinancialYear(year, month, refYear, refMonth) {
  if (getFinancialYearStart(year, month) !== getFinancialYearStart(refYear, refMonth)) return false;
  return monthSortKey(year, month) < monthSortKey(refYear, refMonth);
}

module.exports = { getFinancialYearStart, getRemainingMonthsInFY, isBeforeInFinancialYear };
