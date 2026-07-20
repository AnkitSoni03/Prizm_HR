'use strict';

const service = require('./company.service');
const { parsePagination } = require('../../utils/pagination');
const { assertCompanyInCallerGroup } = require('../../utils/resolveCompanyScope');
const { HttpError } = require('../../utils/errors');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listCompanies({
      callerCompanyId: req.auth.companyId,
      callerGroupId: req.auth.groupId,
      groupId: req.query.groupId || null,
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const company = await service.getCompanyById({
      id: req.params.id,
      callerCompanyId: req.auth.companyId,
      callerGroupId: req.auth.groupId,
    });
    res.json({ data: company });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { groupId, name, legalName, gstNumber, planId, usesBrands } = req.body;
    if (!groupId || !name) {
      return res.status(400).json({ error: 'groupId and name are required' });
    }

    const company = await service.createCompany({
      groupId,
      name,
      legalName,
      gstNumber,
      planId,
      usesBrands,
      createdBy: req.auth.userId,
    });
    res.status(201).json({ data: company });
  } catch (err) {
    next(err);
  }
}

// Company create/delete stay Super-Admin-only (route-level requireSuperAdmin),
// but update is shared: Group Admin and Company Admin both hold
// company:update (seeded in 20260707130200-seed-role-permissions.js) so they
// can fix up their own Companies' basic profile — scoped here the same way
// getCompanyById already scopes reads, since the route middleware alone
// (requirePermission('company:update')) can't tell "my own company" apart
// from "any company". Status/lifecycle changes are carved out separately:
// only Super Admin holds the dedicated company:suspend permission, so a
// scoped caller including `status` in the body is rejected outright rather
// than silently ignored.
async function update(req, res, next) {
  try {
    const targetId = req.params.id;
    const isSuperAdmin = req.auth.companyId === null && req.auth.groupId === null;

    if (!isSuperAdmin) {
      if (req.auth.companyId !== null) {
        if (String(req.auth.companyId) !== String(targetId)) {
          throw new HttpError(404, 'Company not found');
        }
      } else {
        await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId: targetId });
      }
      if (req.body.status !== undefined) {
        throw new HttpError(403, 'Only Super Admin can change a company\'s status');
      }
    }

    const company = await service.updateCompany({ id: targetId, updates: req.body });
    res.json({ data: company });
  } catch (err) {
    next(err);
  }
}

async function getAdminInvitation(req, res, next) {
  try {
    const invitation = await service.getCompanyAdminInvitation(req.params.id);
    res.json({ data: invitation });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteCompany({ id: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, getAdminInvitation, remove };
