'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runWithTenant } = require('../../config/tenant-context');
const { uploadBuffer, buildObjectPath } = require('../../utils/gcs');
const { indexFace, deleteFace, searchFaceAcrossCompanies } = require('../../utils/rekognition');

const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — a single still frame, not a video

// Same threshold faceAttendance.service.js uses to accept a kiosk match —
// deliberately not paired with that flow's ambiguity margin, since here the
// question is simply "does this face already belong to someone", not
// "identify exactly who". Reusing the number (rather than a separate,
// looser one) means a face this sure to be treated as a duplicate here is
// also sure enough to actually be matched at check-in — the two checks stay
// consistent with each other.
const DUPLICATE_SIMILARITY_THRESHOLD = 92;

// A kiosk identifies a face across every company in its Group (see
// faceAttendance.service.js), so two different employees under the same
// Group sharing one face would be a real ambiguity at check-in time, not
// just a data-quality nit — duplicate detection at registration has to
// search the same scope a kiosk search would, not just the registering
// employee's own company.
async function companyIdsInSameGroup(companyId) {
  const company = await db.Company.findByPk(companyId, { attributes: ['id', 'groupId'] });
  if (!company || !company.groupId) return [companyId];

  const companies = await db.Company.findAll({ where: { groupId: company.groupId }, attributes: ['id'] });
  return companies.map((c) => c.id);
}

// Rejects (409) if this photo's face already matches a *different*
// employee's active profile anywhere in the Group. Looked up the same way
// faceAttendance.service.js resolves a kiosk match — by the AWS FaceId
// against EmployeeFaceProfile, never trusting Rekognition's ExternalImageId
// alone — so a stray AWS-side face with no corresponding local row is
// treated as "no duplicate" rather than a false positive.
async function assertFaceNotAlreadyRegistered({ companyId, employeeId, imageBuffer }) {
  const companyIds = await companyIdsInSameGroup(companyId);
  const matches = await searchFaceAcrossCompanies({ companyIds, imageBuffer });

  // On a re-registration, this employee's OWN previous face is still in the
  // collection (it isn't deleted until after this check passes) and is
  // usually the closest match by far — so the very top match being "self"
  // must not short-circuit the whole check. Walk every match down to the
  // threshold and resolve each one back to its real owner via the local
  // EmployeeFaceProfile row, the same way faceAttendance.service.js resolves
  // a kiosk match — never trusting Rekognition's own ExternalImageId for
  // identity — until the first one that turns out to be a *different*
  // employee.
  for (const match of matches) {
    if (match.Similarity < DUPLICATE_SIMILARITY_THRESHOLD) break; // sorted descending — nothing further can qualify

    // EmployeeFaceProfile is tenant-scoped (models/hooks/tenant-scope.js),
    // and this runs under the *registering* employee's own company context
    // — a duplicate living in a sibling company of the same Group would
    // otherwise be silently filtered out by that hook forcing company_id
    // back to the caller's own (CLAUDE.md's "Known gotcha" note). Bypassed
    // the same way officeKiosk.service.js::createScannerAccount bypasses it
    // for the Scanner role lookup — this query already carries its own
    // explicit companyId, so the hook has nothing legitimate to add.
    // eslint-disable-next-line no-await-in-loop
    const existing = await runWithTenant({ companyId: null }, () =>
      db.EmployeeFaceProfile.findOne({
        where: { companyId: match.companyId, rekognitionFaceId: match.Face.FaceId, status: 'active' },
        include: [
          {
            model: db.Employee,
            as: 'employee',
            attributes: ['id', 'userId'],
            include: [{ model: db.User, as: 'loginUser', attributes: ['email'], paranoid: false }],
          },
        ],
      })
    );
    if (!existing || !existing.employee) continue; // stray AWS-side face with no local row — not a duplicate
    if (String(existing.employeeId) === String(employeeId)) continue; // this employee's own (pre-replacement) face

    const email = existing.employee.loginUser?.email;
    throw new HttpError(
      409,
      email
        ? `Your face is already registered via "${email}". Each face can only be registered to one account.`
        : 'Your face is already registered to another account.',
      'FACE_ALREADY_REGISTERED'
    );
  }
}

async function registerFaceProfile({ companyId, employeeId, imageBuffer }) {
  if (!employeeId) throw new HttpError(400, 'No employee record linked to this user');
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new HttpError(400, 'A photo is required to register your face');
  }
  if (imageBuffer.length > MAX_PHOTO_SIZE_BYTES) {
    throw new HttpError(400, 'Photo is too large');
  }

  // Checked before touching anything else — indexFace below would otherwise
  // add this photo to the collection unconditionally, so the duplicate
  // check has to run first and reject up front.
  await assertFaceNotAlreadyRegistered({ companyId, employeeId, imageBuffer });

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
