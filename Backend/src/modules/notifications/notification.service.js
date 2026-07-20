'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

// company_id is applied automatically by the tenant-scope hook (see
// models/hooks/tenant-scope.js) from the request's async-local tenant
// context — every call site here still filters by userId explicitly, since
// that's the one dimension the hook doesn't cover and cross-user leakage
// within the same company would be a real bug.
async function listNotifications({ userId, limit, offset }) {
  const { rows, count } = await db.Notification.findAndCountAll({
    where: { userId },
    limit,
    offset,
    order: [['id', 'DESC']],
  });
  return { rows, count };
}

async function getUnreadCount({ userId }) {
  return db.Notification.count({ where: { userId, isRead: false } });
}

async function markNotificationRead({ userId, id }) {
  const notification = await db.Notification.findOne({ where: { id, userId } });
  if (!notification) throw new HttpError(404, 'Notification not found');
  if (!notification.isRead) {
    await notification.update({ isRead: true, readAt: new Date() });
  }
  return notification;
}

async function markAllNotificationsRead({ userId }) {
  await db.Notification.update({ isRead: true, readAt: new Date() }, { where: { userId, isRead: false } });
}

module.exports = { listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead };
