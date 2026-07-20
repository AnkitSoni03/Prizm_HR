'use strict';

const Redis = require('ioredis');

// Upstash (dev/test) requires TLS on its Redis endpoint regardless of the
// URL scheme, so tls is always enabled here rather than inferred from
// REDIS_URL. Used for the QR replay guard (SET jti EX rotation_seconds NX)
// and short-lived WebAuthn challenge storage.
const redis = new Redis(process.env.REDIS_URL, { tls: {} });

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

module.exports = redis;

