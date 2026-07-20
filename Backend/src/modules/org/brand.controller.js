'use strict';

const service = require('./brand.service');
const { parsePagination } = require('../../utils/pagination');
const { resolveCompanyScope } = require('../../utils/resolveCompanyScope');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    const { rows, count } = await service.listBrands({ companyId, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const brand = await service.getBrandForRead(req.params.id);
    res.json({ data: brand });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { companyId, name, code, address, city, state } = req.body;
    if (!companyId || !name) {
      return res.status(400).json({ error: 'companyId and name are required' });
    }

    const brand = await service.createBrand({ companyId, name, code, address, city, state });
    res.status(201).json({ data: brand });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const brand = await service.updateBrand({
      callerCompanyId: req.auth.companyId,
      id: req.params.id,
      updates: req.body,
    });
    res.json({ data: brand });
  } catch (err) {
    next(err);
  }
}

async function getAdminInvitation(req, res, next) {
  try {
    const invitation = await service.getBrandAdminInvitation(req.params.id);
    res.json({ data: invitation });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteBrand({ callerCompanyId: req.auth.companyId, id: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, getAdminInvitation, remove };
