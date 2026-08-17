'use strict';

const service = require('./rosterGroup.service');
const { parsePagination } = require('../../utils/pagination');
const { resolveCompanyScope, requireCompanyScope } = require('../../utils/resolveCompanyScope');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    const { rows, count } = await service.listRosterGroups({ companyId, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const rosterGroup = await service.getRosterGroupForRead(req.params.id);
    res.json({ data: rosterGroup });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const rosterGroup = await service.createRosterGroup({
      companyId,
      name,
      description,
      createdBy: req.auth.userId,
    });
    res.status(201).json({ data: rosterGroup });
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

    const rosterGroup = await service.updateRosterGroup({
      companyId,
      id: req.params.id,
      updates: req.body,
      updatedBy: req.auth.userId,
    });
    res.json({ data: rosterGroup });
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

    await service.deleteRosterGroup({ companyId, id: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function assign(req, res, next) {
  try {
    const { employeeIds } = req.body;
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ error: 'employeeIds (non-empty array) is required' });
    }

    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const results = await service.bulkAssignRosterGroup({ companyId, id: req.params.id, employeeIds });
    res.status(200).json({ data: results });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove, assign };
