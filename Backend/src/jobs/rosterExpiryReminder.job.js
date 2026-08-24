'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { computeRosterExpiry, daysUntil } = require('../utils/rosterValidity');
const { notifyUser, notifyApprovers } = require('../utils/notifications');

// Descending — the job walks these in order and fires the LARGEST threshold
// still >= days remaining, so an employee only ever gets one reminder per
// crossing (7-day heads-up, then a 3-day, then a 1-day, then an on-the-day
// one) rather than one per day in between.
const REMINDER_THRESHOLDS_DAYS = [7, 3, 1, 0];

// Repeatable job, scheduled daily from src/server.js. Advisory-only per
// explicit product decision — an expired Roster keeps working exactly as
// before (shift/leave resolution never checks rosterAssignedAt), this job
// only tells admin/manager/employee it's time to renew or reassign.
async function sendRosterExpiryReminders({ asOf = new Date() } = {}) {
  const employees = await db.Employee.findAll({
    where: {
      rosterGroupId: { [Op.not]: null },
      rosterAssignedAt: { [Op.not]: null },
      isActive: true,
    },
    include: [
      { model: db.RosterGroup, as: 'rosterGroup', attributes: ['id', 'name', 'validityValue', 'validityUnit'] },
      { model: db.Employee, as: 'manager', attributes: ['id', 'userId'] },
    ],
  });

  let notified = 0;

  for (const employee of employees) {
    try {
      const rosterGroup = employee.rosterGroup;
      if (!rosterGroup || !rosterGroup.validityValue || !rosterGroup.validityUnit) continue;

      const expiryDate = computeRosterExpiry({
        assignedAt: employee.rosterAssignedAt,
        validityValue: rosterGroup.validityValue,
        validityUnit: rosterGroup.validityUnit,
      });
      if (!expiryDate) continue;

      const remaining = daysUntil(expiryDate, asOf);
      // Already past expiry — advisory-only, this job doesn't keep
      // escalating forever once the window has closed.
      if (remaining < 0) continue;

      const threshold = REMINDER_THRESHOLDS_DAYS.find((t) => remaining <= t);
      if (threshold === undefined) continue;

      const alreadyNotified = employee.rosterExpiryNotifiedThresholdDays;
      // A smaller (or equal) threshold than this one was already notified
      // this cycle — nothing new to say yet.
      if (alreadyNotified !== null && alreadyNotified !== undefined && Number(alreadyNotified) <= threshold) continue;

      const label = remaining === 0 ? 'today' : remaining === 1 ? 'in 1 day' : `in ${remaining} days`;
      const body = `Valid until ${expiryDate}. Renew it or assign a new Roster before it expires.`;

      await notifyUser({
        companyId: employee.companyId,
        userId: employee.userId,
        type: 'roster_expiring',
        title: `Your Roster "${rosterGroup.name}" expires ${label}`,
        body,
      });
      if (employee.manager?.userId) {
        await notifyUser({
          companyId: employee.companyId,
          userId: employee.manager.userId,
          type: 'roster_expiring',
          title: `${employee.name}'s Roster "${rosterGroup.name}" expires ${label}`,
          body,
        });
      }
      // Company/brand-wide holders of employee:update (the same permission
      // that gates Change Roster/Renew) — no dedicated "manage roster"
      // permission code exists, and this is exactly the set of people who
      // can act on the reminder.
      await notifyApprovers({
        companyId: employee.companyId,
        brandId: employee.brandId,
        code: 'employee:update',
        type: 'roster_expiring',
        title: `${employee.name}'s Roster "${rosterGroup.name}" expires ${label}`,
        body,
      });

      await employee.update({ rosterExpiryNotifiedThresholdDays: threshold });
      notified += 1;
    } catch (err) {
      console.error(`roster-expiry-reminder job failed for employee ${employee.id}:`, err);
    }
  }

  return { notified };
}

module.exports = { sendRosterExpiryReminders };
