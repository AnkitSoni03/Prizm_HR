'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { runAsCompany } = require('../config/tenant-context');
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
    const brandScope = brandId ? [{ brandId: null }, { brandId }] : null;
    const roleInclude = [
      {
        model: db.Role,
        as: 'role',
        required: true,
        include: [{ model: db.Permission, as: 'permissions', where: { code }, required: true }],
      },
    ];

    const where = { companyId };
    if (brandScope) where[Op.or] = brandScope;
    const grants = await db.UserRole.findAll({ where, include: roleInclude });

    // Group-level holders too: the Group Admin (company_id NULL) and anyone
    // holding a Group-level power from a sibling company. Looked up with the
    // tenant hook off, since their grants aren't on this company.
    const company = await runAsCompany(null, () =>
      db.Company.findByPk(companyId, { attributes: ['id', 'groupId'] })
    );
    if (company?.groupId) {
      const groupWhere = { groupId: company.groupId };
      if (brandScope) groupWhere[Op.or] = brandScope;
      const groupGrants = await runAsCompany(null, () =>
        db.UserRole.findAll({ where: groupWhere, include: roleInclude })
      );
      grants.push(...groupGrants);
    }

    // Each recipient's row is filed under their own company so their bell
    // (tenant-scoped to their home company) shows it; a Group Admin has none
    // and reads without a tenant filter, so the item's company works.
    const excluded = new Set([excludeUserId, ...excludeUserIds].filter(Boolean).map(String));
    const recipients = new Map();
    for (const grant of grants) {
      const key = String(grant.userId);
      if (excluded.has(key) || recipients.has(key)) continue;
      recipients.set(key, { userId: grant.userId, companyId: grant.companyId || companyId });
    }

    await Promise.all(
      [...recipients.values()].map(async ({ userId, companyId: rowCompanyId }) => {
        const notification = await db.Notification.create({
          companyId: rowCompanyId,
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
