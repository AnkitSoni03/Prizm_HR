'use strict';

const db = require('../models');
const { HttpError } = require('./errors');

// Shared by shift/holiday/companyPolicy/leavePolicy services — each accepts
// an optional rosterGroupIds array from its own "Assign to Roster(s)" field
// and needs the same tenancy check before touching any join table.
async function assertRosterGroupsBelongToCompany(rosterGroupIds, companyId) {
  if (!Array.isArray(rosterGroupIds) || rosterGroupIds.length === 0) return;
  const uniqueIds = [...new Set(rosterGroupIds.map(String))];
  const count = await db.RosterGroup.count({ where: { id: uniqueIds, companyId } });
  if (count !== uniqueIds.length) {
    throw new HttpError(400, 'One or more Roster Groups not found for this company');
  }
}

module.exports = { assertRosterGroupsBelongToCompany };
