'use strict';

const { getSignedDownloadUrl } = require('./gcs');

// Best-effort, logged-not-thrown signed URL for a plain Employee model
// instance's photoUrl (private GCS object path) — a GCS hiccup should never
// break a list/read that happens to include employee photos. Shared by
// attendance.service.js and faceFlag.service.js; employee.service.js keeps
// its own withPhotoUrl (different input shape — a record it then spreads
// onto via .toJSON()).
async function photoDownloadUrlFor(employee) {
  if (!employee || !employee.photoUrl) return null;
  try {
    return await getSignedDownloadUrl(employee.photoUrl);
  } catch (err) {
    console.error('Could not generate signed URL for employee photo:', err);
    return null;
  }
}

// Batch version for a findAndCountAll `rows` array where each row has an
// `employee` association (LeaveRequest/OdRequest/AttendanceRegularization/
// CompOffCredit list queries) — converts each row to plain JSON and adds
// `employee.photoDownloadUrl`, matching the field name every list-consuming
// frontend page already reads (see e.g. company-admin/ApprovalsPage.tsx).
async function withEmployeePhoto(rows) {
  return Promise.all(
    rows.map(async (row) => {
      const plain = typeof row.toJSON === 'function' ? row.toJSON() : row;
      if (plain.employee) {
        plain.employee.photoDownloadUrl = await photoDownloadUrlFor(row.employee);
      }
      return plain;
    })
  );
}

module.exports = { photoDownloadUrlFor, withEmployeePhoto };
