'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { invalidateCompanyFaceCache } = require('./faceCache');

const EMBEDDING_LENGTH = 128;
// front/left/right captures of the same person should land well within this
// distance of each other — anything further suggests a bad capture (wrong
// face, heavy occlusion) rather than normal angle variation.
const SELF_CONSISTENCY_MAX_DISTANCE = 0.5;

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function assertValidEmbedding(label, embedding) {
  if (
    !Array.isArray(embedding) ||
    embedding.length !== EMBEDDING_LENGTH ||
    embedding.some((v) => typeof v !== 'number' || !Number.isFinite(v))
  ) {
    throw new HttpError(400, `${label} embedding must be an array of ${EMBEDDING_LENGTH} finite numbers`);
  }
}

async function registerFaceProfile({ companyId, employeeId, embeddings, photoObjectPaths }) {
  if (!employeeId) throw new HttpError(400, 'No employee record linked to this user');
  if (!embeddings || !embeddings.front || !embeddings.left || !embeddings.right) {
    throw new HttpError(400, 'front, left, and right embeddings are all required');
  }

  const { front, left, right } = embeddings;
  assertValidEmbedding('front', front);
  assertValidEmbedding('left', left);
  assertValidEmbedding('right', right);

  const dFrontLeft = euclideanDistance(front, left);
  const dFrontRight = euclideanDistance(front, right);
  const dLeftRight = euclideanDistance(left, right);
  if (Math.max(dFrontLeft, dFrontRight, dLeftRight) > SELF_CONSISTENCY_MAX_DISTANCE) {
    throw new HttpError(400, 'The three captured angles do not appear to be the same face — please retake all three.');
  }

  // Look up including soft-deleted rows so a previously-revoked profile is
  // restored-and-updated in place, rather than colliding with the partial
  // unique index (one active row per employee) on a fresh insert.
  let profile = await db.EmployeeFaceProfile.findOne({ where: { employeeId }, paranoid: false });

  const fields = {
    companyId,
    employeeId,
    embeddingFront: front,
    embeddingLeft: left,
    embeddingRight: right,
    photoObjectPathFront: photoObjectPaths?.front ?? null,
    photoObjectPathLeft: photoObjectPaths?.left ?? null,
    photoObjectPathRight: photoObjectPaths?.right ?? null,
    status: 'active',
    registeredAt: new Date(),
  };

  if (profile) {
    if (profile.deletedAt) await profile.restore();
    await profile.update(fields);
  } else {
    profile = await db.EmployeeFaceProfile.create(fields);
  }

  await invalidateCompanyFaceCache(companyId);

  return { registered: true, registeredAt: profile.registeredAt };
}

async function getMyFaceProfileStatus({ employeeId }) {
  if (!employeeId) throw new HttpError(400, 'No employee record linked to this user');

  const profile = await db.EmployeeFaceProfile.findOne({ where: { employeeId, status: 'active' } });
  return profile
    ? { registered: true, registeredAt: profile.registeredAt, status: profile.status }
    : { registered: false, registeredAt: null, status: null };
}

module.exports = { registerFaceProfile, getMyFaceProfileStatus, euclideanDistance, assertValidEmbedding };
