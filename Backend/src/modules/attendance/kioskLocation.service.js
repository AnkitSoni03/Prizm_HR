'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');

// How long a claim survives without a heartbeat before another device may
// take the location over. The kiosk page beats every 60s while it's open,
// so 3 minutes tolerates a couple of missed beats (flaky wifi, a tab the
// browser throttled) while still freeing a location within a few minutes of
// a device being unplugged or its browser killed — without this, a crashed
// kiosk would hold its location hostage forever with no admin recourse.
const STALE_SESSION_MS = 3 * 60 * 1000;

function staleCutoff() {
  return new Date(Date.now() - STALE_SESSION_MS);
}

// A claim is live only if it has a session id AND that session has been
// seen recently. Anything else is free to take.
function isClaimLive(location) {
  if (!location.activeSessionId) return false;
  if (!location.sessionLastSeenAt) return false;
  return new Date(location.sessionLastSeenAt) > staleCutoff();
}

function newSessionId() {
  return crypto.randomBytes(24).toString('hex');
}

function toPublic(location, { sessionId } = {}) {
  return {
    id: String(location.id),
    name: location.name,
    isActive: location.isActive,
    inUse: isClaimLive(location),
    // True when *this very device* is the one holding it — lets the kiosk
    // re-select its own location after a page reload instead of being told
    // it's occupied by itself.
    heldByThisDevice: !!sessionId && location.activeSessionId === sessionId && isClaimLive(location),
  };
}

// Every location belonging to this kiosk account, live-claim state included.
// Used by both the kiosk's own picker and Super Admin's management list.
async function listLocationsForAccount({ kioskUserId, sessionId = null }) {
  const rows = await db.KioskLocation.findAll({
    where: { kioskUserId },
    order: [['name', 'ASC']],
  });
  return rows.map((row) => toPublic(row, { sessionId }));
}

// What the sign-in screen actually offers: active locations that no *other*
// live device is currently running as. A location the calling device
// already holds stays in the list (so a reload can re-claim it), which is
// exactly the "don't show a location that's already logged in on another
// device" rule — "another" being the operative word.
async function listSelectableLocations({ kioskUserId, sessionId = null }) {
  const rows = await listLocationsForAccount({ kioskUserId, sessionId });
  return rows.filter((row) => row.isActive && (!row.inUse || row.heldByThisDevice));
}

// Claiming is a single conditional UPDATE rather than read-then-write: two
// devices tapping the same location at the same instant would both pass a
// separate "is it free?" read and both think they won. The WHERE clause is
// the race guard — whichever UPDATE lands second matches zero rows.
async function claimLocation({ kioskUserId, locationId, sessionId }) {
  const session = sessionId || newSessionId();

  const location = await db.KioskLocation.findOne({ where: { id: locationId, kioskUserId } });
  if (!location) throw new HttpError(404, 'Location not found for this kiosk account');
  if (!location.isActive) throw new HttpError(409, 'This location has been disabled. Pick another one.');

  const [affected] = await db.KioskLocation.update(
    { activeSessionId: session, sessionClaimedAt: new Date(), sessionLastSeenAt: new Date() },
    {
      where: {
        id: locationId,
        kioskUserId,
        isActive: true,
        [Op.or]: [
          { activeSessionId: null },
          { activeSessionId: session },
          { sessionLastSeenAt: null },
          { sessionLastSeenAt: { [Op.lt]: staleCutoff() } },
        ],
      },
    }
  );

  if (affected === 0) {
    throw new HttpError(409, 'This location is already signed in on another device.', 'LOCATION_TAKEN');
  }

  // One device runs as one location: drop any other location this same
  // device was previously holding, so switching locations doesn't leave the
  // old one locked until it goes stale.
  await db.KioskLocation.update(
    { activeSessionId: null, sessionClaimedAt: null, sessionLastSeenAt: null },
    { where: { kioskUserId, activeSessionId: session, id: { [Op.ne]: locationId } } }
  );

  const claimed = await db.KioskLocation.findByPk(locationId);
  return { sessionId: session, location: toPublic(claimed, { sessionId: session }) };
}

// Renews the claim. A 409 here is meaningful, not cosmetic: it means
// something else took this location over (the device slept past the
// staleness window), and the kiosk must send the operator back to the
// picker rather than keep punching under a location it no longer owns.
async function heartbeatLocation({ kioskUserId, sessionId }) {
  if (!sessionId) throw new HttpError(400, 'sessionId is required');

  const [affected] = await db.KioskLocation.update(
    { sessionLastSeenAt: new Date() },
    { where: { kioskUserId, activeSessionId: sessionId } }
  );
  if (affected === 0) {
    throw new HttpError(409, 'This kiosk location session is no longer active.', 'LOCATION_LOST');
  }

  const location = await db.KioskLocation.findOne({ where: { kioskUserId, activeSessionId: sessionId } });
  return toPublic(location, { sessionId });
}

async function releaseLocation({ kioskUserId, sessionId }) {
  if (!sessionId) return { released: false };
  const [affected] = await db.KioskLocation.update(
    { activeSessionId: null, sessionClaimedAt: null, sessionLastSeenAt: null },
    { where: { kioskUserId, activeSessionId: sessionId } }
  );
  return { released: affected > 0 };
}

// Called on the check-in path: resolves (and refreshes) the location this
// device is running as. A punch is itself proof of life, so it doubles as a
// heartbeat — a kiosk in constant use never goes stale even if a heartbeat
// request gets dropped.
async function requireClaimedLocation({ kioskUserId, sessionId }) {
  if (!sessionId) {
    throw new HttpError(409, 'This kiosk has not selected a location. Please sign in again.', 'LOCATION_REQUIRED');
  }
  const location = await db.KioskLocation.findOne({ where: { kioskUserId, activeSessionId: sessionId } });
  if (!location || !location.isActive) {
    throw new HttpError(409, 'This kiosk location session is no longer active.', 'LOCATION_LOST');
  }
  await location.update({ sessionLastSeenAt: new Date() });
  return location;
}

module.exports = {
  STALE_SESSION_MS,
  newSessionId,
  listLocationsForAccount,
  listSelectableLocations,
  claimLocation,
  heartbeatLocation,
  releaseLocation,
  requireClaimedLocation,
};
