'use strict';

const service = require('./dashboard.service');
const { requireCompanyScope } = require('../../utils/resolveCompanyScope');

async function summary(req, res, next) {
  try {
    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    const data = await service.getDashboardSummary({ companyId });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// brandId isn't on the JWT (see auth.middleware.js's requireAuth), so the
// Brand Admin frontend must supply its own — the brand:read permission gate
// on this route (see dashboard.routes.js) already rejects a brandId that
// isn't the caller's own grant, same as every other brand-scoped list.
async function brandSummary(req, res, next) {
  try {
    const companyId = req.auth.companyId;
    const brandId = req.query.brandId;
    if (!brandId) {
      return res.status(400).json({ error: 'brandId is required' });
    }
    const data = await service.getDashboardSummary({ companyId, brandId });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function groupSummary(req, res, next) {
  try {
    const groupId = req.auth.groupId;
    if (!groupId) {
      return res.status(400).json({ error: 'This account has no group scope' });
    }
    const data = await service.getGroupDashboardSummary({ groupId });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function platformSummary(req, res, next) {
  try {
    const data = await service.getPlatformDashboardSummary();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

module.exports = { summary, brandSummary, groupSummary, platformSummary };
