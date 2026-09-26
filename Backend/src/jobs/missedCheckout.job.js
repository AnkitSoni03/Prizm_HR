'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { CHECKOUT_WINDOW_MS } = require('../utils/shiftTime');

// Repeatable job, scheduled hourly from src/server.js. Persists the
// "Missed Checkout" flag on every attendance row still open past the
// 12h30m checkout window (utils/shiftTime.js). The UI already shows it the
// moment the window passes (computed live on read); this just makes it
// stick in the table itself, for reports/exports and anything that reads
// the column directly. Status is left untouched — the day keeps counting as
// present until a regularization corrects it.
async function markMissedCheckouts({ asOf = new Date() } = {}) {
  const [marked] = await db.Attendance.update(
    { checkoutMissed: true },
    {
      where: {
        checkIn: { [Op.ne]: null, [Op.lt]: new Date(asOf.getTime() - CHECKOUT_WINDOW_MS) },
        checkOut: null,
        checkoutMissed: false,
      },
    }
  );
  return { marked };
}

module.exports = { markMissedCheckouts };
