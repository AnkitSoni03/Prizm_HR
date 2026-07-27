'use strict';

const redis = require('./redis');

// A connection that issues SUBSCRIBE is locked into subscriber-only mode by
// the Redis protocol and can't run normal commands afterward — so the
// office-video-trigger pub/sub side needs its own dedicated connection,
// duplicated from (and sharing the TLS config of) the shared client. Lazily
// created, same convention as gcs.js's getStorage(), so importing this
// module never opens a connection until the SSE route is actually hit.
let subscriber = null;
function getSubscriber() {
  if (!subscriber) {
    subscriber = redis.duplicate();
    subscriber.on('error', (err) => console.error('Redis subscriber connection error:', err.message));
  }
  return subscriber;
}

module.exports = { getSubscriber };
