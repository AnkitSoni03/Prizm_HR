'use strict';

const service = require('./notification.service');
const { parsePagination } = require('../../utils/pagination');
const sseHub = require('../../utils/sseHub');

// Keeps the connection alive through intermediary proxies/load balancers
// that would otherwise time out an idle HTTP connection — a comment line
// (ignored by EventSource's parser) is enough, no real event needed.
const HEARTBEAT_MS = 25_000;

function stream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  sseHub.addClient(req.auth.userId, res);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseHub.removeClient(req.auth.userId, res);
  });
}

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

module.exports = { list, unreadCount, markRead, markAllRead, stream };
