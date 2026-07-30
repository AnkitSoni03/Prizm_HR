'use strict';

const service = require('./salaryComponent.service');

async function list(req, res, next) {
  try {
    const rows = await service.listComponents({
      companyId: req.auth.companyId,
      includeInactive: req.query.includeInactive === 'true',
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { code, name, componentCategory, calculationType, defaultValue, percentageOfComponentId, displayOrder, isPfWage, taxable } = req.body;
    if (!code || !name || !componentCategory || !calculationType) {
      return res.status(400).json({ error: 'code, name, componentCategory and calculationType are required' });
    }

    const component = await service.createComponent({
      companyId: req.auth.companyId,
      code,
      name,
      componentCategory,
      calculationType,
      defaultValue,
      percentageOfComponentId,
      displayOrder,
      isPfWage,
      taxable,
    });
    res.status(201).json({ data: component });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const component = await service.updateComponent({
      companyId: req.auth.companyId,
      id: req.params.id,
      updates: req.body,
    });
    res.json({ data: component });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deactivateComponent({ companyId: req.auth.companyId, id: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
