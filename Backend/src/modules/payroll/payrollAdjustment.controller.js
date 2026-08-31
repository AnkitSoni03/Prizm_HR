'use strict';

const service = require('./payrollAdjustment.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listAdjustments({
      companyId: req.auth.companyId,
      employeeId: req.query.employeeId,
      periodMonth: req.query.periodMonth,
      periodYear: req.query.periodYear,
      status: req.query.status,
      limit,
      offset,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { employeeId, periodMonth, periodYear, componentDefinitionId, type, amount, description } = req.body;
    if (!employeeId || !periodMonth || !periodYear || !type || !amount) {
      return res.status(400).json({ error: 'employeeId, periodMonth, periodYear, type and amount are required' });
    }

    const adjustment = await service.createAdjustment({
      companyId: req.auth.companyId,
      employeeId,
      periodMonth,
      periodYear,
      componentDefinitionId,
      type,
      amount,
      description,
      createdByUserId: req.auth.userId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.status(201).json({ data: adjustment });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const adjustment = await service.updateAdjustment({
      companyId: req.auth.companyId,
      id: req.params.id,
      updates: req.body,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: adjustment });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.cancelAdjustment({
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
