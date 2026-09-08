'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { uploadBuffer, buildObjectPath } = require('../../utils/gcs');
const { indexFace, deleteFace } = require('../../utils/rekognition');

const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — a single still frame, not a video

async function registerFaceProfile({ companyId, employeeId, imageBuffer }) {
  if (!employeeId) throw new HttpError(400, 'No employee record linked to this user');
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new HttpError(400, 'A photo is required to register your face');
  }
  if (imageBuffer.length > MAX_PHOTO_SIZE_BYTES) {
    throw new HttpError(400, 'Photo is too large');
  }

  // Look up including soft-deleted rows so a previously-revoked profile is
  // restored-and-updated in place, rather than colliding with the partial
  // unique index (one active row per employee) on a fresh insert.
  let profile = await db.EmployeeFaceProfile.findOne({ where: { employeeId }, paranoid: false });

  // Re-registering — drop the old AWS-side face first so a stale/replaced
  // photo doesn't linger in the collection as a second, orphaned match
  // candidate for the same employee. Best-effort: never blocks re-registration.
  if (profile && profile.rekognitionFaceId) {
    await deleteFace({ companyId, faceId: profile.rekognitionFaceId });
  }

  const { faceId } = await indexFace({ companyId, employeeId, imageBuffer });

  const destination = buildObjectPath({
    companyId,
    resource: 'face-profiles',
    resourceId: employeeId,
    fileName: `photo-${Date.now()}.jpg`,
  });
  await uploadBuffer({ buffer: imageBuffer, destination, contentType: 'image/jpeg' });

  const fields = {
    companyId,
    employeeId,
    rekognitionFaceId: faceId,
    photoObjectPath: destination,
    status: 'active',
    registeredAt: new Date(),
  };

  if (profile) {
    if (profile.deletedAt) await profile.restore();
    await profile.update(fields);
  } else {
    profile = await db.EmployeeFaceProfile.create(fields);
  }

  return { registered: true, registeredAt: profile.registeredAt };
}

async function getMyFaceProfileStatus({ employeeId }) {
  if (!employeeId) throw new HttpError(400, 'No employee record linked to this user');

  const profile = await db.EmployeeFaceProfile.findOne({ where: { employeeId, status: 'active' } });
  return profile
    ? { registered: true, registeredAt: profile.registeredAt, status: profile.status }
    : { registered: false, registeredAt: null, status: null };
}

module.exports = { registerFaceProfile, getMyFaceProfileStatus };
