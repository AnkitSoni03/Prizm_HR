'use strict';

const { Op } = require('sequelize');
const db = require('../models');

// Repeatable job, scheduled every 5 minutes from src/server.js. Closes the
// "employee scanned the kiosk QR but never completed the WebAuthn step"
// gap — without this, an abandoned PendingAttendance row would sit in
// 'pending' forever instead of being auditable as a clean failure.
async function sweepExpiredPendingAttendance({ asOf = new Date() } = {}) {
  const [expired] = await db.PendingAttendance.update(
    { status: 'expired' },
    { where: { status: 'pending', expiresAt: { [Op.lt]: asOf } } }
  );

  return { expired };
}

module.exports = { sweepExpiredPendingAttendance };
