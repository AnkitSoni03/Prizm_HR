'use strict';

const service = require('./holiday.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listHolidays({
      limit,
      offset,
      brandId: req.query.brandId,
      rosterGroupId: req.query.rosterGroupId,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { brandId, rosterGroupIds, date, toDate, name, type } = req.body;
    if (!date || !name) {
      return res.status(400).json({ error: 'date and name are required' });
    }

    // toDate is optional — omit it for a plain single-day holiday, the
    // resulting row's endDate just defaults to date itself.
    const holiday = await service.createHoliday({
      companyId: req.auth.companyId,
      brandId,
      rosterGroupIds,
      date,
      toDate,
      name,
      type,
      createdBy: req.auth.userId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.status(201).json({ data: holiday });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const holiday = await service.updateHoliday({
      companyId: req.auth.companyId,
      id: req.params.id,
      updates: req.body,
      updatedBy: req.auth.userId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: holiday });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteHoliday({
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
