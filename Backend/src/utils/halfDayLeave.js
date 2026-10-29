'use strict';

const { Op } = require('sequelize');
const db = require('../models');

// True when the employee has an approved half-day leave on `date`.
// `excludeRequestId` skips a request that is being reverted inside the
// same transaction (its own status flips only after the attendance update).
async function hasApprovedHalfDayLeave({ employeeId, date, excludeRequestId, transaction }) {
  const count = await db.LeaveRequest.count({
    where: {
      employeeId,
      status: 'approved',
      halfDaySession: { [Op.ne]: null },
      fromDate: date,
      ...(excludeRequestId ? { id: { [Op.ne]: excludeRequestId } } : {}),
    },
    transaction,
  });
  return count > 0;
}

// Status for a day the employee actually worked: 'half_day' when the other
// half is an approved half-day leave, else 'present'. With that leave behind
// it, payroll treats 'half_day' as worked and charges the leave half from the
// request itself; a 'half_day' with no such leave pays only 0.5
// (payrollEngine.js::classifyDays).
async function workedStatusFor({ employeeId, date, excludeRequestId, transaction }) {
  return (await hasApprovedHalfDayLeave({ employeeId, date, excludeRequestId, transaction })) ? 'half_day' : 'present';
}

module.exports = { hasApprovedHalfDayLeave, workedStatusFor };
