'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { dateOnly, addDays } = require('../utils/dateRange');
const { deleteObject } = require('../utils/gcs');

const RETENTION_DAYS = 90;

// Repeatable job, scheduled daily at 2am from src/server.js. Deletes the GCS
// object and nulls the corresponding column for any attendance row's video
// older than the retention window — per-row (not a single bulk query) since
// each row can independently have a checkin video, a checkout video, both,
// or neither, and a GCS delete has to happen per object path.
async function cleanupExpiredAttendanceVideos({ asOf = new Date() } = {}) {
  const cutoff = addDays(dateOnly(asOf), -RETENTION_DAYS);

  const rows = await db.Attendance.findAll({
    where: {
      date: { [Op.lt]: cutoff },
      [Op.or]: [{ videoObjectPathCheckin: { [Op.ne]: null } }, { videoObjectPathCheckout: { [Op.ne]: null } }],
    },
  });

  let cleaned = 0;
  for (const row of rows) {
    const updates = {};
    if (row.videoObjectPathCheckin) {
      await deleteObject(row.videoObjectPathCheckin);
      updates.videoObjectPathCheckin = null;
    }
    if (row.videoObjectPathCheckout) {
      await deleteObject(row.videoObjectPathCheckout);
      updates.videoObjectPathCheckout = null;
    }
    await row.update(updates);
    cleaned += 1;
  }

  return { cleaned };
}

module.exports = { cleanupExpiredAttendanceVideos };
