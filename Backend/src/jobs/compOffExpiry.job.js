'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { dateOnly } = require('../utils/dateRange');
const { notifyUser } = require('../utils/notifications');

// Repeatable job, scheduled daily ('0 0 * * *') from src/server.js.
// PHASE4_MODELS.md: "A background job ... should flip stale 'approved'
// credits past expiry_date to 'expired'."
//
// Loaded with the owning Employee (rather than a single bulk UPDATE) so each
// expired credit's employee can be notified — the one status change in the
// approval lifecycle that's system-triggered rather than a user action, but
// still something the employee should be told about.
async function sweepExpiredCompOff({ asOf = new Date() } = {}) {
  const today = dateOnly(asOf);
  const expiring = await db.CompOffCredit.findAll({
    where: { status: 'approved', expiryDate: { [Op.lt]: today } },
    include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'companyId', 'userId'] }],
  });

  for (const credit of expiring) {
    await credit.update({ status: 'expired' });
    await notifyUser({
      companyId: credit.employee.companyId,
      userId: credit.employee.userId,
      type: 'request_expired',
      requestType: 'comp_off_credit',
      requestId: credit.id,
      title: 'Your comp-off credit expired',
      body: `Earned ${credit.earnedDate}`,
    });
  }

  return { expired: expiring.length };
}

module.exports = { sweepExpiredCompOff };
