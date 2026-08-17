'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { dateOnly, addDays } = require('../utils/dateRange');
const { notifyUser } = require('../utils/notifications');

// Repeatable job, scheduled daily from src/server.js. Holidays only ever
// store DATEONLY fields (no time-of-day), so "reminder within 24 hours" is
// interpreted the same way the rest of this codebase treats date-only
// fields: the holiday *starts* on tomorrow's local date. A multi-day holiday
// only fires this once, the day before its first day — not once per day in
// the range.
//
// Runs unscoped (no tenant context exists outside an HTTP request — see
// tenant-scope.js) across every company, then groups matches by
// company/brand to resolve which employees to notify, same shape as
// workingDays.js's isHoliday: a brand-specific holiday only notifies that
// brand's employees, a company-wide holiday (brand_id NULL) notifies every
// employee in the company.
async function sendHolidayReminders({ asOf = new Date() } = {}) {
  const tomorrow = addDays(dateOnly(asOf), 1);

  const holidays = await db.Holiday.findAll({
    where: { date: tomorrow, reminderSentAt: null },
    include: [{ model: db.RosterGroup, as: 'rosterGroups', through: { attributes: [] }, attributes: ['id'] }],
  });

  let notified = 0;

  for (const holiday of holidays) {
    try {
      const rosterGroupIds = holiday.rosterGroups.map((rg) => rg.id);
      const employees = await db.Employee.findAll({
        where: {
          companyId: holiday.companyId,
          ...(holiday.brandId ? { brandId: holiday.brandId } : {}),
          ...(rosterGroupIds.length > 0 ? { rosterGroupId: { [Op.in]: rosterGroupIds } } : {}),
          isActive: true,
          userId: { [Op.not]: null },
        },
        attributes: ['id', 'userId'],
      });

      for (const employee of employees) {
        await notifyUser({
          companyId: holiday.companyId,
          userId: employee.userId,
          type: 'holiday_reminder',
          requestType: null,
          requestId: holiday.id,
          title: `Holiday tomorrow: ${holiday.name}`,
          body:
            holiday.endDate !== holiday.date
              ? `${holiday.name} is a holiday from ${holiday.date} to ${holiday.endDate}. Plan ahead!`
              : `${holiday.name} is a holiday on ${holiday.date}. Plan ahead!`,
        });
        notified += 1;
      }

      await holiday.update({ reminderSentAt: new Date() });
    } catch (err) {
      console.error(`holiday-reminder job failed for holiday ${holiday.id}:`, err);
    }
  }

  return { holidays: holidays.length, notified };
}

module.exports = { sendHolidayReminders };
