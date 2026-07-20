'use strict';

const service = require('./payrollSettings.service');

async function get(req, res, next) {
  try {
    const settings = await service.getOrCreateSettings(req.auth.companyId);
    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const settings = await service.updateSettings({ companyId: req.auth.companyId, updates: req.body });
    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
}

module.exports = { get, update };
