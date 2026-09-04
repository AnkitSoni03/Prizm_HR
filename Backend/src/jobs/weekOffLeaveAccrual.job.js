'use strict';

const db = require('../models');
const { toBusinessLocal } = require('../utils/dateRange');
const { syncWeekOffLeaveForRosterGroup } = require('../modules/leave/weekOffLeave.service');

// Repeatable job, scheduled '0 0 1 * *' (same as leaveAccrual.job.js) — a
// monthly catch-up sweep across every Roster Group, on top of the eager
// provisioning shift.service.js::syncShiftRosterGroups already does the
// moment an admin actually links a no-weekly-off Shift to a Roster Group.
// This sweep exists for the month-boundary case the eager path can't cover
// by itself: a Roster Group that was ALREADY eligible when the previous
// month ended still needs THIS month's own balance row/Sunday-count, and
// nothing else would ever trigger that on its own.
//
// Re-derives eligibility from scratch every run rather than tracking it
// anywhere — if a Roster Group's Shift later gains a weekly-off day, it
// simply stops being touched by future runs; past months' balances/history
// are left alone, same "never destroy history" precedent as everything else
// in this module.
async function runWeekOffLeaveAccrual({ asOf = toBusinessLocal() } = {}) {
  const rosterGroups = await db.RosterGroup.findAll({
    include: [{ model: db.Shift, as: 'shifts', through: { attributes: [] } }],
  });

  let processed = 0;
  for (const group of rosterGroups) {
    if (group.shifts.length !== 1) continue;
    const result = await syncWeekOffLeaveForRosterGroup({
      rosterGroupId: group.id,
      companyId: group.companyId,
      weeklyOffDays: group.shifts[0].weeklyOffDays,
      asOf,
    });
    processed += result.processed;
  }

  return { processed };
}

module.exports = { runWeekOffLeaveAccrual };
