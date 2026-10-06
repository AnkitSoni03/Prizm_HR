'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const sseHub = require('./sseHub');

// Always best-effort, logged-not-thrown — same convention as comp-off
// auto-detection and the activation/reset emails: a bug in notification
// delivery must never block the actual approve/reject/create write it's
// reporting on.
async function notifyUser({ companyId, userId, type, requestType, requestId, title, body }) {
  if (!userId) return;
  try {
    const notification = await db.Notification.create({
      companyId,
      userId,
      type,
      requestType: requestType || null,
      requestId: requestId || null,
      title,
      body: body || null,
    });
    sseHub.sendToUser(userId, notification.toJSON());
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

// Resolves every user holding `code` company-wide or scoped to `brandId`
// within `companyId` — same join shape as rbac.middleware.js's
// getBrandScope — and fans out one notification row per recipient.
// excludeUserId keeps a submitter who also happens to hold the approve
// permission (e.g. via the per-employee "powers" feature) from notifying
// themselves about their own submission.
// excludeUserIds (array) does the same for several users at once — e.g. a
// reminder job that already notified someone as a manager.
async function notifyApprovers({
  companyId,
  brandId,
  code,
  excludeUserId,
  excludeUserIds = [],
  type,
  requestType,
  requestId,
  title,
  body,
}) {
  try {
    const where = { companyId };
    if (brandId) where[Op.or] = [{ brandId: null }, { brandId }];

    const grants = await db.UserRole.findAll({
      where,
      include: [
        {
          model: db.Role,
          as: 'role',
          required: true,
          include: [{ model: db.Permission, as: 'permissions', where: { code }, required: true }],
        },
      ],
    });

    const excluded = new Set([excludeUserId, ...excludeUserIds].filter(Boolean).map(String));
    const userIds = [...new Set(grants.map((grant) => grant.userId))].filter(
      (userId) => !excluded.has(String(userId))
    );

    await Promise.all(
      userIds.map(async (userId) => {
        const notification = await db.Notification.create({
          companyId,
          userId,
          type,
          requestType: requestType || null,
          requestId: requestId || null,
          title,
          body: body || null,
        });
        sseHub.sendToUser(userId, notification.toJSON());
      })
    );
  } catch (err) {
    console.error('Failed to create approver notifications:', err);
  }
}

module.exports = { notifyUser, notifyApprovers };
