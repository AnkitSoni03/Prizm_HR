'use strict';

const bcrypt = require('bcrypt');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const redis = require('../../config/redis');
const { runWithTenant } = require('../../config/tenant-context');
const { generateOfficeToken, generateSseTicket } = require('../../utils/officeToken');
const { uploadBuffer, buildObjectPath } = require('../../utils/gcs');
const { getAssertionOptions, verifyEmployeeBiometric, applyAttendancePunch } = require('./attendance.service');

const BCRYPT_ROUNDS = 12;
const OFFICE_TOKEN_TTL_SECONDS = 17; // ~12s kiosk poll + rotation, +5s clock-skew grace
const PENDING_ATTENDANCE_TTL_MINUTES = 2;
const SSE_TICKET_TTL_SECONDS = 30;

function officeTokenKey(token) {
  return `office_token:${token}`;
}

function sseTicketKey(ticket) {
  return `sse_ticket:${ticket}`;
}

function videoTriggerChannel(kioskUserId) {
  return `office_video_trigger:${kioskUserId}`;
}

// A kiosk's brandId isn't on its JWT (auth.middleware.js only signs
// companyId/groupId/employeeId) — same reason the Brand Admin frontend
// reads its own brandId off GET /auth/me's roles[] instead. Resolved fresh
// per call rather than cached, since a kiosk account is rarely re-scoped
// but correctness matters more than the extra lookup.
async function resolveKioskScope({ userId, companyId }) {
  const grant = await db.UserRole.findOne({
    where: { userId, companyId },
    include: [{ model: db.Role, as: 'role', where: { name: 'Scanner', isSystem: true }, required: true }],
  });
  if (!grant) throw new HttpError(403, 'Not a Scanner account for this company');
  return { brandId: grant.brandId };
}

async function issueOfficeToken({ userId, companyId }) {
  const { brandId } = await resolveKioskScope({ userId, companyId });
  const token = generateOfficeToken();
  const expiresAt = new Date(Date.now() + OFFICE_TOKEN_TTL_SECONDS * 1000);

  await redis.set(
    officeTokenKey(token),
    JSON.stringify({ kioskUserId: userId, companyId, brandId }),
    'EX',
    OFFICE_TOKEN_TTL_SECONDS
  );

  return { officeToken: token, expiresAt };
}

// PHASE3_MODELS.md-style two-phase flow, kiosk variant: resolve the kiosk's
// token, create the durable PendingAttendance row, then hand back a
// WebAuthn challenge exactly like the old terminal flow's
// assertion-options step (attendance.service.js::getAssertionOptions,
// reused unchanged — it has no dependency on the terminal mechanism).
async function verifyOfficeQr({ companyId, employeeId, officeToken, action }) {
  if (!employeeId) throw new HttpError(400, 'No employee record linked to this user');
  if (action !== 'checkin' && action !== 'checkout') {
    throw new HttpError(400, "action must be 'checkin' or 'checkout'");
  }

  const raw = await redis.get(officeTokenKey(officeToken));
  if (!raw) throw new HttpError(401, 'Office QR token is invalid or expired');
  const resolved = JSON.parse(raw);

  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(401, 'Employee not found for this company');

  if (resolved.companyId !== companyId) {
    throw new HttpError(403, "Kiosk does not belong to the employee's company");
  }
  // A brand-scoped kiosk (resolved.brandId set) only serves that brand's
  // employees. A company-wide kiosk (resolved.brandId null) serves every
  // employee in the company regardless of brand — same shape as the old
  // terminal.brandId check in attendance.service.js::checkIn.
  if (resolved.brandId !== null && String(resolved.brandId) !== String(employee.brandId)) {
    throw new HttpError(403, "Kiosk does not belong to the employee's brand");
  }

  // Checked before creating the PendingAttendance row (not just left to
  // getAssertionOptions's own check below) so a scan from an employee who
  // never registered a device doesn't leave an orphaned pending row behind
  // on every attempt — it would get swept by pendingAttendanceExpiry.job.js
  // either way, but there's no reason to create it at all here.
  const deviceCount = await db.EmployeeDevice.count({ where: { employeeId, status: 'active' } });
  if (deviceCount === 0) {
    throw new HttpError(400, 'No registered device for this employee — device registration is required before check-in');
  }

  const pending = await db.PendingAttendance.create({
    companyId,
    brandId: resolved.brandId,
    employeeId,
    kioskUserId: resolved.kioskUserId,
    action,
    status: 'pending',
    expiresAt: new Date(Date.now() + PENDING_ATTENDANCE_TTL_MINUTES * 60 * 1000),
  });

  const assertionOptions = await getAssertionOptions({ employeeId });
  return { pendingAttendanceId: pending.id, assertionOptions };
}

async function completeVerifyOfficeBiometric({ companyId, employeeId, pendingAttendanceId, webauthnAssertion }) {
  if (!employeeId) throw new HttpError(400, 'No employee record linked to this user');

  const pending = await db.PendingAttendance.findOne({
    where: { id: pendingAttendanceId, employeeId, companyId, status: 'pending' },
  });
  if (!pending) throw new HttpError(404, 'Pending scan not found, already completed, or expired');

  if (pending.expiresAt < new Date()) {
    await pending.update({ status: 'expired' });
    throw new HttpError(404, 'Pending scan not found, already completed, or expired');
  }

  const { device, newCounter } = await verifyEmployeeBiometric({ employeeId, webauthnAssertion });
  await device.update({ lastUsedAt: new Date(), signatureCounter: newCounter });

  const result = await applyAttendancePunch({
    employeeId,
    now: new Date(),
    source: 'office_kiosk',
    deviceId: device.id,
    kioskUserId: pending.kioskUserId,
  });

  await pending.update({ status: 'completed' });

  // Best-effort — a dropped/never-delivered pub/sub message means the video
  // never gets recorded, but the attendance write above already committed,
  // which is what actually matters (CLAUDE.md rule 6: no fallback punch,
  // but also no punch should ever be silently lost because of a video/UX
  // side channel failing).
  try {
    await redis.publish(
      videoTriggerChannel(pending.kioskUserId),
      JSON.stringify({ recordId: result.attendance.id, action: pending.action })
    );
  } catch (err) {
    console.error('Office video trigger publish failed:', err);
  }

  return result;
}

async function issueSseTicket({ userId }) {
  const ticket = generateSseTicket();
  await redis.set(sseTicketKey(ticket), String(userId), 'EX', SSE_TICKET_TTL_SECONDS);
  return { ticket };
}

// Single-use: deleted on first read so a leaked query-string value (access
// logs, proxy logs — EventSource can't send an Authorization header, so this
// ticket is the only credential available on this route) is worthless a
// moment later.
async function consumeSseTicket(ticket) {
  const key = sseTicketKey(ticket);
  const kioskUserId = await redis.get(key);
  if (!kioskUserId) throw new HttpError(401, 'Invalid or expired stream ticket');
  await redis.del(key);
  return { kioskUserId };
}

async function uploadOfficeVideo({ companyId, kioskUserId, attendanceId, action, buffer, mimetype }) {
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
  issueOfficeToken,
  verifyOfficeQr,
  completeVerifyOfficeBiometric,
  issueSseTicket,
  consumeSseTicket,
  uploadOfficeVideo,
  createScannerAccount,
  listScannerAccounts,
  videoTriggerChannel,
};
