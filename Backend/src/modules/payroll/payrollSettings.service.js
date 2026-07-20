'use strict';

const db = require('../../models');

// Lazily creates the company's payroll_settings row the first time it's
// needed, same convention as leaveBalance.service.js::getOrCreateBalance —
// no seeder backfills this for existing companies.
async function getOrCreateSettings(companyId) {
  let settings = await db.PayrollSettings.findOne({ where: { companyId } });
  if (settings) return settings;

  try {
    settings = await db.PayrollSettings.create({ companyId });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      settings = await db.PayrollSettings.findOne({ where: { companyId } });
    } else {
      throw err;
    }
  }
  return settings;
}

async function updateSettings({ companyId, updates }) {
  const settings = await getOrCreateSettings(companyId);
  const { payCycleStartDay, enableStatutoryDeductions, statutoryConfig, currency } = updates;

  await settings.update({
    ...(payCycleStartDay !== undefined && { payCycleStartDay }),
    ...(enableStatutoryDeductions !== undefined && { enableStatutoryDeductions }),
    ...(statutoryConfig !== undefined && { statutoryConfig }),
    ...(currency !== undefined && { currency }),
  });
  return settings;
}

module.exports = { getOrCreateSettings, updateSettings };
