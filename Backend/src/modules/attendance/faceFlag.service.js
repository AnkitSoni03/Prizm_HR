'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { uploadBuffer, buildObjectPath, getSignedDownloadUrl } = require('../../utils/gcs');

async function listFlags({ companyId, limit, offset, reviewed }) {
  const where = { companyId };
  if (reviewed !== undefined) where.reviewed = reviewed;

  const { rows, count } = await db.FaceVerificationFlag.findAndCountAll({
    where,
    include: [
      { model: db.Employee, as: 'employee', attributes: ['id', 'name', 'employeeCode'] },
      { model: db.User, as: 'kioskUser', attributes: ['id', 'email'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  return { rows, count };
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
