'use strict';

const {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  DeleteFacesCommand,
  SearchFacesByImageCommand,
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
} = require('@aws-sdk/client-rekognition');
const { HttpError } = require('./errors');

// One collection per company (CollectionId pattern only allows
// [a-zA-Z0-9_.-], companyId is numeric so this is always valid) — mirrors
// CLAUDE.md rule 1 (every business table is company_id-scoped): a kiosk in
// Company A can never even be compared against Company B's employees,
// since AWS itself only searches within the one collection we pass.
function companyCollectionId(companyId) {
  return `company-${companyId}-faces`;
}

let client;
function getClient() {
  if (!client) {
    client = new RekognitionClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

// Collections are permanent once created — this Set just avoids a redundant
// CreateCollection round trip on every single registration within the same
// process lifetime; a cold-started process simply calls it once more; this
// is not correctness-critical the way faceCache.js's data was, so a plain
// in-memory Set (no Redis) is enough.
const knownCollections = new Set();

async function ensureCompanyCollection(companyId) {
  const collectionId = companyCollectionId(companyId);
  if (knownCollections.has(collectionId)) return collectionId;

  try {
    await getClient().send(new CreateCollectionCommand({ CollectionId: collectionId }));
  } catch (err) {
    if (err.name !== 'ResourceAlreadyExistsException') throw err;
  }
  knownCollections.add(collectionId);
  return collectionId;
}

// One face per employee — MaxFaces: 1 + QualityFilter AUTO rejects a bad
// capture (no face, multiple faces, low brightness/sharpness) at the AWS
// level rather than us re-implementing that heuristic locally.
async function indexFace({ companyId, employeeId, imageBuffer }) {
  const collectionId = await ensureCompanyCollection(companyId);

  const response = await getClient().send(
    new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: imageBuffer },
      ExternalImageId: String(employeeId),
      MaxFaces: 1,
      QualityFilter: 'AUTO',
      DetectionAttributes: [],
    })
  );

  const record = response.FaceRecords && response.FaceRecords[0];
  if (!record) {
    throw new HttpError(400, 'Could not detect a clear, single face in this photo. Please retake it in good lighting.');
  }

  return { faceId: record.Face.FaceId };
}

// Best-effort — called when replacing an existing registration so the old
// AWS-side face doesn't linger orphaned in the collection. Never allowed to
// block a re-registration if it fails.
async function deleteFace({ companyId, faceId }) {
  if (!faceId) return;
  try {
    await getClient().send(
      new DeleteFacesCommand({ CollectionId: companyCollectionId(companyId), FaceIds: [faceId] })
    );
  } catch (err) {
    console.error('rekognition deleteFace failed (non-blocking):', err);
  }
}

// Returns every match AWS considers plausible (not just the top one) so the
// caller can apply its own ambiguity check — same principle as the old
// matchFaceEmbedding's best-vs-runner-up margin, just on Rekognition's
// Similarity score (higher = closer) instead of Euclidean distance (lower =
// closer). FaceMatchThreshold is intentionally loose here (50) — the
// caller's own stricter threshold + ambiguity margin is the real gate; a
// too-tight FaceMatchThreshold would hide the runner-up needed for that
// check.
async function searchFaceByImage({ companyId, imageBuffer, maxFaces = 4 }) {
  try {
    const response = await getClient().send(
      new SearchFacesByImageCommand({
        CollectionId: companyCollectionId(companyId),
        Image: { Bytes: imageBuffer },
        MaxFaces: maxFaces,
        FaceMatchThreshold: 50,
      })
    );
    return response.FaceMatches || [];
  } catch (err) {
    // No collection yet (company has zero registered employees) or no face
    // detected in the captured image — both mean "no match", not a server
    // error.
    if (err.name === 'ResourceNotFoundException' || err.name === 'InvalidParameterException') {
      return [];
    }
    throw err;
  }
}

// No S3 destination configured on the session, so AWS returns the reference
// image inline (ReferenceImage.Bytes) in GetFaceLivenessSessionResults
// rather than as an S3Object — simplest path, no extra bucket to manage.
async function createLivenessSession() {
  const response = await getClient().send(new CreateFaceLivenessSessionCommand({}));
  return { sessionId: response.SessionId };
}

async function getLivenessSessionResults(sessionId) {
  const response = await getClient().send(
    new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId })
  );

  return {
    status: response.Status, // 'CREATED' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED'
    confidence: response.Confidence ?? null,
    referenceImage: response.ReferenceImage?.Bytes ? Buffer.from(response.ReferenceImage.Bytes) : null,
  };
}

// A group-level kiosk serves every employee of every Company under its
// Group, but Rekognition collections are per-company (see
// companyCollectionId above) — AWS can only search one collection per call.
// So fan out across the group's companies and merge. Each match is tagged
// with the company it came from so the caller can resolve the right
// EmployeeFaceProfile row afterwards, and the merged list is re-sorted by
// Similarity so the caller's best-vs-runner-up ambiguity check still
// compares across the whole group rather than within one company.
//
// Groups hold a handful of companies in practice, and these calls run in
// parallel, so this is one round trip's worth of latency, not N.
async function searchFaceAcrossCompanies({ companyIds, imageBuffer, maxFaces = 4 }) {
  const perCompany = await Promise.all(
    companyIds.map(async (companyId) => {
      const matches = await searchFaceByImage({ companyId, imageBuffer, maxFaces });
      return matches.map((match) => ({ ...match, companyId }));
    })
  );

  return perCompany.flat().sort((a, b) => b.Similarity - a.Similarity);
}

module.exports = {
  companyCollectionId,
  ensureCompanyCollection,
  indexFace,
  deleteFace,
  searchFaceByImage,
  searchFaceAcrossCompanies,
  createLivenessSession,
  getLivenessSessionResults,
};
