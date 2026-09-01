'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { uploadBuffer, buildObjectPath, getSignedDownloadUrl } = require('../../utils/gcs');
const { photoDownloadUrlFor } = require('../../utils/employeePhoto');

async function listFlags({ companyId, limit, offset, reviewed }) {
  const where = { companyId };
  if (reviewed !== undefined) where.reviewed = reviewed;

  const { rows, count } = await db.FaceVerificationFlag.findAndCountAll({
    where,
    include: [
      { model: db.Employee, as: 'employee', attributes: ['id', 'name', 'employeeCode', 'photoUrl'] },
      { model: db.User, as: 'kioskUser', attributes: ['id', 'email'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  // The claimed identity's own profile photo, alongside the capture clip —
  // lets an admin visually compare "who this attempt claims to be" against
  // the video without leaving this list. attendanceId (a plain column, no
  // attributes restriction on the flag itself) rides along in row.toJSON()
  // for free — the frontend uses it to reach a non-blocked attempt's video,
  // which lives on the resulting Attendance row (see uploadFlagCapture's
  // comment below for why only a blocked attempt has its own clip here).
  const withPhotos = await Promise.all(
    rows.map(async (row) => {
      const plain = row.toJSON();
      if (plain.employee) {
        plain.employee.photoDownloadUrl = await photoDownloadUrlFor(row.employee);
      }
      return plain;
    })
  );

  return { rows: withPhotos, count };
}

async function getFlagVideoUrl({ companyId, id }) {
  const flag = await db.FaceVerificationFlag.findOne({ where: { id, companyId } });
  if (!flag) throw new HttpError(404, 'Flagged attempt not found');
  if (!flag.videoObjectPath) throw new HttpError(404, 'No video recorded for this attempt');

  const url = await getSignedDownloadUrl(flag.videoObjectPath);
  return { url };
}

async function markFlagReviewed({ companyId, id, reviewedByUserId }) {
  const flag = await db.FaceVerificationFlag.findOne({ where: { id, companyId } });
  if (!flag) throw new HttpError(404, 'Flagged attempt not found');

  await flag.update({ reviewed: true, reviewedByUserId, reviewedAt: new Date() });
  return flag;
}

// Only meaningful for a blocked attempt — a soft-flagged one (blocked:
// false) already has its capture clip tied to the resulting attendance row
// via the existing officeKiosk.service.js::uploadFaceCapture path.
async function uploadFlagCapture({ companyId, kioskUserId, flagId, buffer, mimetype }) {
  const flag = await db.FaceVerificationFlag.findOne({ where: { id: flagId, companyId } });
  if (!flag) throw new HttpError(404, 'Flagged attempt not found');
  if (String(flag.kioskUserId) !== String(kioskUserId)) {
    throw new HttpError(403, 'This kiosk did not trigger this flagged attempt');
  }
  if (!flag.blocked) throw new HttpError(400, 'This attempt was not blocked — no separate capture needed');

  const extension = mimetype && mimetype.includes('mp4') ? 'mp4' : 'webm';
  const destination = buildObjectPath({
    companyId,
    resource: 'fraud-attempts',
    resourceId: flagId,
    fileName: `${flag.action}-${Date.now()}.${extension}`,
  });

  await uploadBuffer({ buffer, destination, contentType: mimetype || 'video/webm' });
  await flag.update({ videoObjectPath: destination });

  return { objectPath: destination };
}

module.exports = { listFlags, getFlagVideoUrl, markFlagReviewed, uploadFlagCapture };
