'use strict';

const service = require('./notification.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listNotifications({ userId: req.auth.userId, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function unreadCount(req, res, next) {
  try {
    const count = await service.getUnreadCount({ userId: req.auth.userId });
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const notification = await service.markNotificationRead({ userId: req.auth.userId, id: req.params.id });
    res.json({ data: notification });
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    await service.markAllNotificationsRead({ userId: req.auth.userId });
    res.json({ data: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, unreadCount, markRead, markAllRead };
