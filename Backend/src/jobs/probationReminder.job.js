'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { dateOnly } = require('../utils/dateRange');
const {
  PERIOD_EMPLOYMENT_TYPES,
  probationAlertFor,
  describeRemaining,
  periodLabel,
  formatDisplayDate,
} = require('../utils/probation');
const { getManagersForEmployee } = require('../utils/managerScope');
const { notifyUser, notifyApprovers } = require('../utils/notifications');

// Sends today's reminder for one employee if they're due and haven't had
// one today. Returns whether anything was sent.
async function remindEmployee(employee, asOf) {
  const today = dateOnly(asOf);
  if (employee.probationLastNotifiedOn === today) return false;
  const alert = probationAlertFor(employee, asOf);
  if (!alert) return false;

  const period = periodLabel(employee.employmentType);
  const when = describeRemaining(alert.daysRemaining);
  const endLabel = formatDisplayDate(alert.endDate);
  const ended = alert.daysRemaining < 0;
  const name = employee.name || employee.employeeCode || 'An employee';

  await notifyUser({
    companyId: employee.companyId,
    userId: employee.userId,
    type: 'probation_ending',
    title: `Your ${period} ${when}`,
    body: ended
      ? `It ended on ${endLabel}. Your manager and HR will confirm your employment status shortly.`
      : `It ends on ${endLabel}. Your manager and HR will review and confirm your employment status.`,
  });

  const adminTitle = `${name}'s ${period} ${when}`;
  const adminBody = ended
    ? `It ended on ${endLabel} and the Employment Type is still ${employee.employmentType === 'intern' ? 'Intern' : 'Probation'}. Review and update it to Full-time.`
    : `It ends on ${endLabel}. Review their performance and update the Employment Type to Full-time when confirmed.`;

  const managers = await getManagersForEmployee({ companyId: employee.companyId, employeeId: employee.id });
  const notifiedUserIds = new Set([String(employee.userId)]);
  for (const manager of managers) {
    if (!manager.userId || notifiedUserIds.has(String(manager.userId))) continue;
    notifiedUserIds.add(String(manager.userId));
    await notifyUser({
      companyId: manager.companyId,
      userId: manager.userId,
      type: 'probation_ending',
      title: adminTitle,
      body: adminBody,
    });
  }
  await notifyApprovers({
    companyId: employee.companyId,
    brandId: employee.brandId,
    code: 'employee:update',
    excludeUserIds: [...notifiedUserIds],
    type: 'probation_ending',
    title: adminTitle,
    body: adminBody,
  });

  await employee.update({ probationLastNotifiedOn: today });
  return true;
}

// Daily (src/server.js). For every active Probation/Intern employee whose
// period ends within REMINDER_LEAD_DAYS (or has already ended), notifies the
// employee, all of their managers, and every admin who can edit them
// (employee:update, company-wide or for their Brand — the people who can
// change the Employment Type). Repeats once a day — including after the end
// date — until the Employment Type is changed (normally to Full-time), which
// drops them out of the query. probation_last_notified_on guards against a
// second send on the same day.
async function sendProbationReminders({ asOf = new Date() } = {}) {
  const today = dateOnly(asOf);
  const employees = await db.Employee.findAll({
    where: {
      isActive: true,
      employmentType: { [Op.in]: PERIOD_EMPLOYMENT_TYPES },
      probationPeriodDays: { [Op.not]: null },
      dateOfJoining: { [Op.not]: null },
      [Op.or]: [{ probationLastNotifiedOn: null }, { probationLastNotifiedOn: { [Op.ne]: today } }],
    },
  });

  let notified = 0;
  for (const employee of employees) {
    try {
      if (await remindEmployee(employee, asOf)) notified += 1;
    } catch (err) {
      console.error(`probation-reminder job failed for employee ${employee.id}:`, err);
    }
  }
  return { notified };
}

// Immediate send for one employee — called right after an admin creates or
// edits them (employee.service.js), so a period that's already within the
// window (or past it) shows up in the bell now, not at the next 9 AM run.
// Best-effort: never throws into the caller's save.
async function sendProbationReminderForEmployee(employeeId, { asOf = new Date() } = {}) {
  try {
    const employee = await db.Employee.findOne({
      where: {
        id: employeeId,
        isActive: true,
        employmentType: { [Op.in]: PERIOD_EMPLOYMENT_TYPES },
        probationPeriodDays: { [Op.not]: null },
        dateOfJoining: { [Op.not]: null },
      },
    });
    if (employee) await remindEmployee(employee, asOf);
  } catch (err) {
    console.error(`probation reminder failed for employee ${employeeId}:`, err);
  }
}

module.exports = { sendProbationReminders, sendProbationReminderForEmployee };
