'use strict';

// In-memory registry of open SSE connections, keyed by userId. One entry is
// a Set of `res` objects — a user can have more than one (multiple tabs/
// devices), and every one of them should get the push.
//
// Deliberately in-process, no Redis: this only needs to reach a connection
// held open by *this* server process. If the app ever runs multiple Node
// instances behind a load balancer, a user's stream connection and the
// request that triggers notifyUser/notifyApprovers could land on different
// instances, and this stops being enough (would need a pub/sub broadcast,
// e.g. via Redis, to fan the event out to every instance) — not needed for
// this app's current single-instance deployment.
const connectionsByUserId = new Map();

function addClient(userId, res) {
  const key = String(userId);
  if (!connectionsByUserId.has(key)) {
    connectionsByUserId.set(key, new Set());
  }
  connectionsByUserId.get(key).add(res);
}

function removeClient(userId, res) {
  const key = String(userId);
  const conns = connectionsByUserId.get(key);
  if (!conns) return;
  conns.delete(res);
  if (conns.size === 0) connectionsByUserId.delete(key);
}

// Best-effort, mirrors notifyUser/notifyApprovers's own convention — a
// broken pipe on one connection must never affect the others or the caller.
function sendToUser(userId, payload) {
  const conns = connectionsByUserId.get(String(userId));
  if (!conns || conns.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of conns) {
    try {
      res.write(data);
    } catch (err) {
      console.error('Failed to write SSE event:', err);
    }
  }
}

module.exports = { addClient, removeClient, sendToUser };
