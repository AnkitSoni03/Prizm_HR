'use strict';

const service = require('./compOffPolicy.service');

async function list(req, res, next) {
  try {
    const policies = await service.listCompOffPolicies({
      companyId: req.auth.companyId,
      brandId: req.query.brandId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: policies });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, expiryDays, carryForward, brandId } = req.body;
    const policy = await service.createCompOffPolicy({
      companyId: req.auth.companyId,
      brandId,
      scopedBrandIds: req.auth.scopedBrandIds,
      name,
      expiryDays,
      carryForward,
      createdBy: req.auth.userId,
    });
    res.status(201).json({ data: policy });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const policy = await service.updateCompOffPolicy({
      companyId: req.auth.companyId,
      id: req.params.id,
      updates: req.body,
      updatedBy: req.auth.userId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteCompOffPolicy({
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listEmployees(req, res, next) {
  try {
    const employees = await service.listEmployeesForAssignment({
      companyId: req.auth.companyId,
      scopedBrandIds: req.auth.scopedBrandIds,
      search: req.query.search,
    });
    res.json({ data: employees });
  } catch (err) {
    next(err);
  }
}

async function assign(req, res, next) {
  try {
    const { employeeIds, compOffPolicyId } = req.body;
    const result = await service.assignCompOffPolicy({
      companyId: req.auth.companyId,
      scopedBrandIds: req.auth.scopedBrandIds,
      employeeIds,
      compOffPolicyId,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove, listEmployees, assign };
