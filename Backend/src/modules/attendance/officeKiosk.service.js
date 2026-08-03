'use strict';

const bcrypt = require('bcrypt');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runWithTenant } = require('../../config/tenant-context');
const { uploadBuffer, buildObjectPath } = require('../../utils/gcs');

const BCRYPT_ROUNDS = 12;

// A kiosk's brandId isn't on its JWT (auth.middleware.js only signs
// companyId/groupId/employeeId) — same reason the Brand Admin frontend
// reads its own brandId off GET /auth/me's roles[] instead. Resolved fresh
// per call rather than cached, since a kiosk account is rarely re-scoped
// but correctness matters more than the extra lookup. Reused as-is by
// faceAttendance.service.js to scope a kiosk's face-match candidates to
// its own brand.
async function resolveKioskScope({ userId, companyId }) {
  const grant = await db.UserRole.findOne({
    where: { userId, companyId },
    include: [{ model: db.Role, as: 'role', where: { name: 'Scanner', isSystem: true }, required: true }],
  });
  if (!grant) throw new HttpError(403, 'Not a Scanner account for this company');
  return { brandId: grant.brandId };
}

// Audit capture clip for a face-recognition check-in/out — uploaded
// immediately by the kiosk right after a successful match (it already has
// the attendance.id from the face-checkin response, unlike the old
// office-kiosk flow which needed a separate SSE push to learn it).
async function uploadFaceCapture({ companyId, kioskUserId, attendanceId, action, buffer, mimetype }) {
  if (action !== 'checkin' && action !== 'checkout') {
    throw new HttpError(400, "action must be 'checkin' or 'checkout'");
  }

  const attendance = await db.Attendance.findOne({
    where: { id: attendanceId },
    include: [{ model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'companyId'] }],
  });
  if (!attendance) throw new HttpError(404, 'Attendance record not found');
  if (String(attendance.kioskUserId) !== String(kioskUserId)) {
    throw new HttpError(403, 'This kiosk did not trigger this attendance record');
  }

  const extension = mimetype && mimetype.includes('mp4') ? 'mp4' : 'webm';
  const destination = buildObjectPath({
    companyId,
    resource: 'attendance-videos',
    resourceId: attendanceId,
    fileName: `${action}-${Date.now()}.${extension}`,
  });

  await uploadBuffer({ buffer, destination, contentType: mimetype || 'video/webm' });

  const field = action === 'checkin' ? 'videoObjectPathCheckin' : 'videoObjectPathCheckout';
  await attendance.update({ [field]: destination });

  return { objectPath: destination };
}

async function createScannerAccount({ companyId, brandId, email, password }) {
  if (!email || !password) throw new HttpError(400, 'email and password are required');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  if (brandId) {
    const brand = await db.Brand.findOne({ where: { id: brandId, companyId } });
    if (!brand) throw new HttpError(404, 'Brand not found for this company');
  }

  // Role.company_id IS NULL for a system role like Scanner, but this
  // function runs inside the caller's (Company/Brand Admin) tenant context
  // — Role's tenant-scope hook would silently inject that caller's
  // company_id into the query and filter a NULL-company_id row out
  // entirely (see CLAUDE.md's "Known gotcha" note). Nest a null-company
  // context for just this one query, same fix already applied to
  // auth.service.js::inviteEmployeeUser.
  const role = await runWithTenant({ companyId: null }, () =>
    db.Role.findOne({ where: { name: 'Scanner', isSystem: true } })
  );
  if (!role) throw new HttpError(500, 'Scanner role is not seeded');

  const existing = await db.User.findOne({ where: { companyId, email } });
  if (existing) throw new HttpError(409, 'A user with this email already exists for this company');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await db.sequelize.transaction(async (t) => {
    const createdUser = await db.User.create(
      { companyId, email, passwordHash, status: 'active', isActive: true, activatedAt: new Date() },
      { transaction: t }
    );
    await db.UserRole.create(
      { userId: createdUser.id, roleId: role.id, companyId, brandId: brandId || null },
      { transaction: t }
    );
    return createdUser;
  });

  return { id: user.id, email: user.email, brandId: brandId || null };
}

async function listScannerAccounts({ companyId, brandId }) {
  const where = { companyId };
  if (brandId) where.brandId = brandId;

  const grants = await db.UserRole.findAll({
    where,
    include: [
      { model: db.Role, as: 'role', where: { name: 'Scanner', isSystem: true }, required: true, attributes: [] },
      { model: db.User, as: 'user', attributes: ['id', 'email', 'status', 'lastLoginAt'] },
    ],
  });

  return grants.map((grant) => ({
    id: grant.user.id,
    email: grant.user.email,
    status: grant.user.status,
    lastLoginAt: grant.user.lastLoginAt,
    brandId: grant.brandId,
  }));
}

module.exports = {
  resolveKioskScope,
  uploadFaceCapture,
  createScannerAccount,
  listScannerAccounts,
};
