'use strict';

const { EventEmitter } = require('events');

// Minimal in-memory stand-in for the small ioredis surface this codebase
// actually uses (get/set/del/publish/duplicate) — local-dev only, for when
// no real Redis is reachable yet. Opt-in via REDIS_URL=memory in .env
// (see redis.js) — never a silent fallback, so a genuinely misconfigured
// deployment still fails loudly against a real Redis instead of quietly
// working on this instead.
//
// Good enough to exercise the office kiosk workflow end-to-end on one
// machine: TTL expiry, SET NX, and pub/sub all behave the same from the
// caller's point of view. NOT a real Redis substitute beyond that — state
// lives only in this process's memory (lost on restart) and there is no
// cross-instance behavior at all, which is the entire reason the real
// deployment needs real Redis. Never use this outside local dev.

const store = new Map(); // key -> { value, expiresAt }
const bus = new EventEmitter();
bus.setMaxListeners(0);

function isExpired(entry) {
  return entry.expiresAt !== null && entry.expiresAt <= Date.now();
}

function get(key) {
  const entry = store.get(key);
  if (!entry || isExpired(entry)) {
    store.delete(key);
    return Promise.resolve(null);
  }
  return Promise.resolve(entry.value);
}

// Mirrors the exact call shapes used in this codebase:
//   redis.set(key, value, 'EX', seconds)
//   redis.set(key, value, 'EX', seconds, 'NX')
function set(key, value, ...args) {
  let ttlSeconds = null;
  let nx = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === 'EX') ttlSeconds = Number(args[i + 1]);
    if (args[i] === 'NX') nx = true;
  }

  const existing = store.get(key);
  if (nx && existing && !isExpired(existing)) {
    return Promise.resolve(null); // NX + key already set: real ioredis returns null
  }

  store.set(key, {
    value: String(value),
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
  return Promise.resolve('OK');
}

function del(key) {
  const existed = store.has(key) && !isExpired(store.get(key));
  store.delete(key);
  return Promise.resolve(existed ? 1 : 0);
}

// Every duplicate() call below shares this one process-wide bus, so a
// publish() reaches every attached 'message' listener directly — there's no
// separate channel-membership state to track for a single-process mock
// (unlike real Redis, which needs it to fan a message out across the
// network to whichever instance is actually subscribed).
function publish(channel, message) {
  bus.emit('message', channel, message);
  return Promise.resolve(0);
}

function on(event, handler) {
  if (event === 'error') return; // nothing to wire up — there's no real connection to drop
  bus.on(event, handler);
}

function off(event, handler) {
  bus.off(event, handler);
}

async function subscribe() {
  // No-op — see the publish() comment above.
}

async function unsubscribe() {}

function duplicate() {
  return memoryRedis;
}

function disconnect() {}
function quit() {
  return Promise.resolve('OK');
}

const memoryRedis = { get, set, del, publish, on, off, subscribe, unsubscribe, duplicate, disconnect, quit };

module.exports = memoryRedis;
