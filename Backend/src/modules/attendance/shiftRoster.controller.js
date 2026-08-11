'use strict';

const service = require('./shiftRoster.service');
const { parsePagination } = require('../../utils/pagination');
const { resolveCompanyScope, requireCompanyScope } = require('../../utils/resolveCompanyScope');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    // Optional for Super Admin (brandId alone is enough to scope the
    // query); a company-scoped caller always uses their own companyId.
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    // req.auth.scopedBrandIds (set by requirePermission) is non-null only
    // for a caller who holds shift_roster:read for specific brand(s) only
    // (no company-wide grant) — force the filter to those brands rather
    // than trusting an omitted/absent query.brandId to mean "all brands".
    const brandId = req.auth.scopedBrandIds ?? req.query.brandId;
    const { rows, count } = await service.listShiftRosters({
      companyId,
      brandId,
      employeeId: req.query.employeeId,
      rosterDate: req.query.rosterDate,
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { employeeId, shiftId, brandId, rosterDate } = req.body;
    if (!shiftId || !rosterDate) {
      return res.status(400).json({ error: 'shiftId and rosterDate are required' });
    }
    // A brand-scoped caller (Brand Admin) must target their own brand
    // explicitly — omitting brandId used to fall through to creating a
    // company-level (brand-less) roster, outside what they're granted.
    if (req.auth.scopedBrandIds && !brandId) {
      return res.status(400).json({ error: 'brandId is required' });
    }

    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const roster = await service.createShiftRoster({
      companyId,
      employeeId,
      shiftId,
      brandId,
      rosterDate,
    });
    res.status(201).json({ data: roster });
  } catch (err) {
    next(err);
  }
}

async function bulkCreate(req, res, next) {
  try {
    const { employeeIds, shiftId, brandId, rosterDate, status } = req.body;
    if (!Array.isArray(employeeIds) || employeeIds.length === 0 || !shiftId || !rosterDate) {
      return res.status(400).json({ error: 'employeeIds (non-empty array), shiftId and rosterDate are required' });
    }
    // Same "an omitted brandId must not silently fall through to company-wide"
    // rule the single create endpoint already enforces for a brand-scoped
    // caller.
    if (req.auth.scopedBrandIds && !brandId) {
      return res.status(400).json({ error: 'brandId is required' });
    }

    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const results = await service.bulkCreateShiftRoster({
      companyId,
      employeeIds,
      shiftId,
      brandId,
      rosterDate,
      status,
      publisherEmployeeId: req.auth.employeeId,
    });
    res.status(201).json({ data: results });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const roster = await service.updateShiftRoster({
      companyId,
      id: req.params.id,
      updates: req.body,
      publisherEmployeeId: req.auth.employeeId,
      // null = caller holds a company-wide grant, no restriction; an array
      // means the target roster's own brandId must be one of these —
      // enforced against the actual row, not whatever the client sent.
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: roster });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });

    await service.deleteShiftRoster({
      companyId,
      id: req.params.id,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, bulkCreate, update, remove };
