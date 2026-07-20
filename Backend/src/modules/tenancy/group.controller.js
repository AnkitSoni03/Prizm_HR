'use strict';

const service = require('./group.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listGroups({
      callerGroupId: req.auth.groupId,
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, status, planId } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const group = await service.createGroup({ name, status, planId, createdBy: req.auth.userId });
    res.status(201).json({ data: group });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const group = await service.updateGroup({ id: req.params.id, updates: req.body });
    res.json({ data: group });
  } catch (err) {
    next(err);
  }
}

async function getAdminInvitation(req, res, next) {
  try {
    const invitation = await service.getGroupAdminInvitation(req.params.id);
    res.json({ data: invitation });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteGroup({ id: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, getAdminInvitation, remove };
