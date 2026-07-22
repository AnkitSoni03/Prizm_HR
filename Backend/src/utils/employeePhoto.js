'use strict';

const { getSignedDownloadUrl } = require('./gcs');

// Shared by every approval-list service (leave/OD/regularization/comp-off)
// that eager-loads a row's `employee` include — resolves that nested
// employee's photoUrl (a private GCS object path) into a signed
// photoDownloadUrl, same convention as employee.service.js::withPhotoUrl.
// Falls back to null (not a throw) on a GCS hiccup so a signing outage never
// breaks an approvals list. No-ops rows with no `employee` include or no
// photo set — the common case.
async function withEmployeePhoto(rows) {
  return Promise.all(
    rows.map(async (row) => {
      const plain = row.toJSON ? row.toJSON() : row;
      if (!plain.employee) return plain;
      if (!plain.employee.photoUrl) {
        return { ...plain, employee: { ...plain.employee, photoDownloadUrl: null } };
      }
      try {
        const photoDownloadUrl = await getSignedDownloadUrl(plain.employee.photoUrl);
        return { ...plain, employee: { ...plain.employee, photoDownloadUrl } };
      } catch (err) {
        console.error('Could not generate signed URL for employee photo:', err);
        return { ...plain, employee: { ...plain.employee, photoDownloadUrl: null } };
      }
    })
  );
}

module.exports = { withEmployeePhoto };
