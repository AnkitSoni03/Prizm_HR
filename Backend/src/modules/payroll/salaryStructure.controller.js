'use strict';

const service = require('./salaryStructure.service');

async function listForEmployee(req, res, next) {
  try {
    const rows = await service.listStructuresForEmployee({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

async function getActiveForEmployee(req, res, next) {
  try {
    const structure = await service.getActiveStructure({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: structure });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const structure = await service.getStructureForRead({
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: structure });
  } catch (err) {
    next(err);
  }
}

async function assign(req, res, next) {
  try {
    const { employeeId, effectiveFrom, annualCtc, components } = req.body;
    if (!employeeId || !effectiveFrom || !annualCtc) {
      return res.status(400).json({ error: 'employeeId, effectiveFrom and annualCtc are required' });
    }

    const structure = await service.assignSalaryStructure({
      companyId: req.auth.companyId,
      employeeId,
      effectiveFrom,
      annualCtc,
      components,
      createdByUserId: req.auth.userId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.status(201).json({ data: structure });
  } catch (err) {
    next(err);
  }
}

module.exports = { listForEmployee, getActiveForEmployee, get, assign };
