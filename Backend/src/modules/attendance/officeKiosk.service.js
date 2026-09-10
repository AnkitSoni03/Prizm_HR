'use strict';

const bcrypt = require('bcrypt');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runWithTenant } = require('../../config/tenant-context');
const { uploadBuffer, buildObjectPath } = require('../../utils/gcs');
const { encryptKioskPassword, decryptKioskPassword } = require('../../utils/kioskCredentials');
const { listLocationsForAccount } = require('./kioskLocation.service');

const BCRYPT_ROUNDS = 12;

// A kiosk account is a GROUP-level machine account: one shared login for a
// whole Group, serving every employee of every Company (and Brand) under
// it. Provisioned by Super Admin only — see officeKiosk.routes.js's
// requireSuperAdmin gate.
//
// Its User row therefore looks like a Group Admin's: company_id NULL,
// group_id set. That shape matters downstream — rbac.middleware.js's
// UserRole lookup is keyed on req.auth.companyId, so a NULL there must
// match a NULL on the grant row, and models/hooks/tenant-scope.js's
// company_id filter goes dormant, which is why every query below scopes by
// group/company ids explicitly instead of relying on the hook.
async function resolveKioskScope({ userId }) {
  const grant = await db.UserRole.findOne({
    where: { userId },
    include: [
      { model: db.Role, as: 'role', where: { name: 'Scanner', isSystem: true }, required: true, attributes: [] },
    ],
  });
  if (!grant || !grant.groupId) throw new HttpError(403, 'Not a group kiosk account');

  const companies = await db.Company.findAll({ where: { groupId: grant.groupId }, attributes: ['id'] });
  return { groupId: grant.groupId, companyIds: companies.map((company) => company.id) };
}

// Audit capture clip for a face-recognition check-in/out — uploaded
// immediately by the kiosk right after a successful match (it already has
// the attendance.id from the face-checkin response).
async function uploadFaceCapture({ companyIds, kioskUserId, attendanceId, action, buffer, mimetype }) {
  if (action !== 'checkin' && action !== 'checkout') {
    throw new HttpError(400, "action must be 'checkin' or 'checkout'");
  }

  const attendance = await db.Attendance.findOne({
    where: { id: attendanceId },
    include: [
      {
        model: db.Employee,
        as: 'employee',
        where: { companyId: companyIds },
        attributes: ['id', 'companyId'],
      },
    ],
  });
  if (!attendance) throw new HttpError(404, 'Attendance record not found');
  if (String(attendance.kioskUserId) !== String(kioskUserId)) {
    throw new HttpError(403, 'This kiosk did not trigger this attendance record');
  }

  const extension = mimetype && mimetype.includes('mp4') ? 'mp4' : 'webm';
  const destination = buildObjectPath({
    companyId: attendance.employee.companyId,
    resource: 'attendance-videos',
    resourceId: attendanceId,
    fileName: `${action}-${Date.now()}.${extension}`,
  });

  await uploadBuffer({ buffer, destination, contentType: mimetype || 'video/webm' });

  const field = action === 'checkin' ? 'videoObjectPathCheckin' : 'videoObjectPathCheckout';
  await attendance.update({ [field]: destination });

  return { objectPath: destination };
}

function normalizeLocationNames(locations) {
  const names = (Array.isArray(locations) ? locations : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean);

  const seen = new Set();
  const unique = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}

// Super Admin creates one (or more) kiosk accounts per Group, each with the
// physical locations that Group's devices will run as. At least one
// location is required — without one there is nothing for a device to claim
// at sign-in, so the account would authenticate and then dead-end.
async function createKioskAccount({ groupId, email, password, locations }) {
  if (!groupId) throw new HttpError(400, 'groupId is required');
  if (!email || !password) throw new HttpError(400, 'email and password are required');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  const locationNames = normalizeLocationNames(locations);
  if (locationNames.length === 0) throw new HttpError(400, 'At least one location is required');

  const group = await db.Group.findByPk(groupId);
  if (!group) throw new HttpError(404, 'Group not found');

  // Role.company_id IS NULL for a system role like Scanner. Super Admin's
  // own tenant context is already null so the tenant-scope hook is dormant,
  // but this stays explicit rather than depending on that — see CLAUDE.md's
  // "Known gotcha" note.
  const role = await runWithTenant({ companyId: null }, () =>
    db.Role.findOne({ where: { name: 'Scanner', isSystem: true } })
  );
  if (!role) throw new HttpError(500, 'Scanner role is not seeded');

  // auth.service.js::login looks a user up by email alone (no tenant
  // context exists yet at login), so a kiosk email has to be unique across
  // the whole platform, not just within one tenant — otherwise the kiosk
  // could never reliably sign in.
  const existing = await runWithTenant({ companyId: null }, () => db.User.findOne({ where: { email } }));
  if (existing) throw new HttpError(409, 'A user with this email already exists');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const kioskPasswordEncrypted = encryptKioskPassword(password);

  const user = await db.sequelize.transaction(async (t) => {
    const createdUser = await db.User.create(
      {
        companyId: null,
        groupId,
        email,
        passwordHash,
        kioskPasswordEncrypted,
        status: 'active',
        isActive: true,
        activatedAt: new Date(),
      },
      { transaction: t }
    );
    await db.UserRole.create(
      { userId: createdUser.id, roleId: role.id, companyId: null, groupId, brandId: null },
      { transaction: t }
    );
    await db.KioskLocation.bulkCreate(
      locationNames.map((name) => ({ groupId, kioskUserId: createdUser.id, name })),
      { transaction: t }
    );
    return createdUser;
  });

  return getKioskAccount({ groupId, userId: user.id });
}

// Shared "is this really a Scanner account belonging to this Group?" guard.
// Every entry point below goes through it, so a Super Admin can never reset
// the password of, or read the locations of, a non-kiosk user by passing
// its id.
async function findKioskGrant({ groupId, userId }) {
  const grant = await db.UserRole.findOne({
    where: groupId ? { userId, groupId } : { userId },
    include: [
      { model: db.Role, as: 'role', where: { name: 'Scanner', isSystem: true }, required: true, attributes: [] },
    ],
  });
  return grant || null;
}

async function getKioskAccount({ groupId, userId }) {
  const grant = await findKioskGrant({ groupId, userId });
  if (!grant) throw new HttpError(404, 'Kiosk account not found');

  const user = await db.User.findByPk(userId, {
    attributes: ['id', 'email', 'status', 'lastLoginAt', 'groupId'],
  });
  if (!user) throw new HttpError(404, 'Kiosk account not found');

  return {
    id: String(user.id),
    email: user.email,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    groupId: String(user.groupId),
    locations: await listLocationsForAccount({ kioskUserId: user.id }),
  };
}

async function listKioskAccounts({ groupId }) {
  if (!groupId) throw new HttpError(400, 'groupId is required');

  const grants = await db.UserRole.findAll({
    where: { groupId },
    include: [
      { model: db.Role, as: 'role', where: { name: 'Scanner', isSystem: true }, required: true, attributes: [] },
      {
        model: db.User,
        as: 'user',
        attributes: ['id', 'email', 'status', 'lastLoginAt', 'groupId'],
        required: true,
      },
    ],
  });

  return Promise.all(
    grants.map(async (grant) => ({
      id: String(grant.user.id),
      email: grant.user.email,
      status: grant.user.status,
      lastLoginAt: grant.user.lastLoginAt,
      groupId: String(grant.groupId),
      locations: await listLocationsForAccount({ kioskUserId: grant.user.id }),
    }))
  );
}

// Replaces the account's location set wholesale. A dropped location is
// soft-deleted rather than hard-deleted — attendance rows point at it
// (attendance.kiosk_location_id), and losing which office a historical
// punch happened at would be silent data loss. A dropped location that a
// live device currently holds is released here too, so that device gets
// bounced back to the picker on its next heartbeat instead of going on
// punching under a location that no longer exists.
async function updateKioskAccountLocations({ groupId, userId, locations }) {
  const grant = await findKioskGrant({ groupId, userId });
  if (!grant) throw new HttpError(404, 'Kiosk account not found');

  const locationNames = normalizeLocationNames(locations);
  if (locationNames.length === 0) throw new HttpError(400, 'At least one location is required');

  const existing = await db.KioskLocation.findAll({ where: { kioskUserId: userId } });
  const byKey = new Map(existing.map((row) => [row.name.toLowerCase(), row]));
  const keepKeys = new Set(locationNames.map((name) => name.toLowerCase()));

  await db.sequelize.transaction(async (t) => {
    for (const name of locationNames) {
      const row = byKey.get(name.toLowerCase());
      if (!row) {
        await db.KioskLocation.create({ groupId: grant.groupId, kioskUserId: userId, name }, { transaction: t });
      } else if (row.name !== name || !row.isActive) {
        await row.update({ name, isActive: true }, { transaction: t });
      }
    }
    for (const row of existing) {
      if (keepKeys.has(row.name.toLowerCase())) continue;
      await row.update(
        { isActive: false, activeSessionId: null, sessionClaimedAt: null, sessionLastSeenAt: null },
        { transaction: t }
      );
      await row.destroy({ transaction: t });
    }
  });

  return getKioskAccount({ groupId, userId });
}

async function resetKioskAccountPassword({ groupId, userId, password }) {
  if (!password) throw new HttpError(400, 'password is required');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  const grant = await findKioskGrant({ groupId, userId });
  if (!grant) throw new HttpError(404, 'Kiosk account not found');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const kioskPasswordEncrypted = encryptKioskPassword(password);
  await db.User.update({ passwordHash, kioskPasswordEncrypted }, { where: { id: userId } });
  return { id: String(userId) };
}

// Decrypts and returns a kiosk account's current plaintext password for the
// "reveal" action — see kioskCredentials.js for why this is possible at all
// (a deliberate, explicitly requested exception to this app's usual
// never-recoverable-password rule, only for Scanner/kiosk machine
// accounts). Returns null (not an error) for an account that was never
// given one; resetting its password fixes that going forward.
async function getKioskAccountPassword({ groupId, userId }) {
  const grant = await findKioskGrant({ groupId, userId });
  if (!grant) throw new HttpError(404, 'Kiosk account not found');

  const user = await db.User.findByPk(userId, { attributes: ['kioskPasswordEncrypted'] });
  if (!user || !user.kioskPasswordEncrypted) return { password: null };

  return { password: decryptKioskPassword(user.kioskPasswordEncrypted) };
}

// Soft-deletes the account and its grant, and releases every location it
// held. Locations are soft-deleted too, for the same "a historical punch
// must keep naming where it happened" reason as above.
async function deleteKioskAccount({ groupId, userId }) {
  const grant = await findKioskGrant({ groupId, userId });
  if (!grant) throw new HttpError(404, 'Kiosk account not found');

  await db.sequelize.transaction(async (t) => {
    await db.KioskLocation.update(
      { isActive: false, activeSessionId: null, sessionClaimedAt: null, sessionLastSeenAt: null },
      { where: { kioskUserId: userId }, transaction: t }
    );
    await db.KioskLocation.destroy({ where: { kioskUserId: userId }, transaction: t });
    await db.UserRole.destroy({ where: { userId }, transaction: t });
    await db.User.destroy({ where: { id: userId }, transaction: t });
  });

  return { id: String(userId) };
}

module.exports = {
  resolveKioskScope,
  uploadFaceCapture,
  createKioskAccount,
  getKioskAccount,
  listKioskAccounts,
  updateKioskAccountLocations,
  resetKioskAccountPassword,
  getKioskAccountPassword,
  deleteKioskAccount,
};
