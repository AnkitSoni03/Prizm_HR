'use strict';

const db = require('../models');
const { HttpError } = require('./errors');

// Shared by shift/holiday/companyPolicy/leavePolicy services — each accepts
// an optional rosterGroupIds array from its own "Assign to Roster(s)" field
// and needs the same tenancy check before touching any join table.
//
// ownerBrandId (optional) is the resolved brandId of the Shift/Holiday/
// Company Policy/Leave Policy being saved — every Roster Group linked to it
// must be company-wide (brandId null) or belong to that SAME Brand.
// Without this, a Brand-A Shift could be linked to a Brand-B Roster Group,
// silently wiring Brand A's scheduling config into Brand B's data (and vice
// versa) even though the two entities are otherwise fully isolated — see
// utils/brandScope.js.
async function assertRosterGroupsBelongToCompany(rosterGroupIds, companyId, ownerBrandId) {
  if (!Array.isArray(rosterGroupIds) || rosterGroupIds.length === 0) return;
  const uniqueIds = [...new Set(rosterGroupIds.map(String))];
  const rows = await db.RosterGroup.findAll({ where: { id: uniqueIds, companyId }, attributes: ['id', 'brandId'] });
  if (rows.length !== uniqueIds.length) {
    throw new HttpError(400, 'One or more Roster Groups not found for this company');
  }
  const mismatched = rows.find((r) => r.brandId && String(r.brandId) !== String(ownerBrandId ?? ''));
  if (mismatched) {
    throw new HttpError(400, 'One or more Roster Groups belong to a different Brand');
  }
}

module.exports = { assertRosterGroupsBelongToCompany };
