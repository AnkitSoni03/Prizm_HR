'use strict';

const service = require('./department.service');
const { parsePagination } = require('../../utils/pagination');
const { resolveCompanyScope, requireCompanyScope } = require('../../utils/resolveCompanyScope');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    const { rows, count } = await service.listDepartments({ companyId, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const department = await service.getDepartmentForRead(req.params.id);
    res.json({ data: department });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, code } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const department = await service.createDepartment({ companyId, name, code });
    res.status(201).json({ data: department });
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

    const department = await service.updateDepartment({
      companyId,
      id: req.params.id,
      updates: req.body,
    });
    res.json({ data: department });
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

    await service.deleteDepartment({ companyId, id: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };
