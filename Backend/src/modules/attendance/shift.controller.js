'use strict';

const service = require('./shift.service');
const { parsePagination } = require('../../utils/pagination');
const { resolveCompanyScope, requireCompanyScope } = require('../../utils/resolveCompanyScope');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    const { rows, count } = await service.listShifts({ companyId, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const shift = await service.getShiftForRead(req.params.id);
    res.json({ data: shift });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, startTime, endTime, isNightShift, weeklyOffDays, rosterGroupIds } = req.body;
    if (!name || !startTime || !endTime) {
      return res.status(400).json({ error: 'name, startTime and endTime are required' });
    }

    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const shift = await service.createShift({
      companyId,
      name,
      startTime,
      endTime,
      isNightShift,
      weeklyOffDays,
      rosterGroupIds,
    });
    res.status(201).json({ data: shift });
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

    const shift = await service.updateShift({
      companyId,
      id: req.params.id,
      updates: req.body,
    });
    res.json({ data: shift });
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

    await service.deleteShift({ companyId, id: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };
