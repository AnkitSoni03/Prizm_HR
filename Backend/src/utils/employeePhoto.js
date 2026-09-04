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

module.exports = { photoDownloadUrlFor };
