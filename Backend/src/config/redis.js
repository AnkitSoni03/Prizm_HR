'use strict';

const Redis = require('ioredis');
const memoryRedis = require('./memoryRedis');

// Three supported shapes, since different environments have handed this
// repo different connection info at different times:
//   - REDIS_URL=memory        -> in-memory stand-in, local dev only, opt-in
//     only (see memoryRedis.js) — never a silent fallback on a connection
//     failure, so a real REDIS_URL/REDISHOST that's merely unreachable
//     still retries against the real thing and logs errors, same as always.
//   - a full REDIS_URL        -> Upstash — requires TLS on its endpoint
//     regardless of URL scheme, so tls is forced on for that path.
//   - REDISHOST/REDISPORT     -> a no-auth instance on a private network —
//     no TLS, since a private-network Redis with no credentials generally
//     isn't running a TLS listener either.
// Used for the QR replay guard (SET jti EX rotation_seconds NX), short-lived
// WebAuthn challenge storage, and the office-kiosk token/pub-sub flow.
let redis;
if (process.env.REDIS_URL === 'memory') {
  console.warn('[redis] Using the in-memory stand-in (REDIS_URL=memory) — local dev only, do not deploy like this.');
  redis = memoryRedis;
} else {
  redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { tls: {} })
    : new Redis({ host: process.env.REDISHOST, port: Number(process.env.REDISPORT) || 6379 });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
  });
}

module.exports = redis;

