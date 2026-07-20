'use strict';

const service = require('./designation.service');
const { parsePagination } = require('../../utils/pagination');
const { resolveCompanyScope, requireCompanyScope } = require('../../utils/resolveCompanyScope');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    const { rows, count } = await service.listDesignations({ companyId, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const designation = await service.getDesignationForRead(req.params.id);
    res.json({ data: designation });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { title, level } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const designation = await service.createDesignation({ companyId, title, level });
    res.status(201).json({ data: designation });
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

    const designation = await service.updateDesignation({
      companyId,
      id: req.params.id,
      updates: req.body,
    });
    res.json({ data: designation });
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

    await service.deleteDesignation({ companyId, id: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };
