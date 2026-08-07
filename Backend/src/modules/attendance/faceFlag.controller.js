'use strict';

const service = require('./faceFlag.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const reviewed = req.query.reviewed === undefined ? undefined : req.query.reviewed === 'true';
    const { rows, count } = await service.listFlags({
      companyId: req.auth.companyId,
      limit,
      offset,
      reviewed,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function videoUrl(req, res, next) {
  try {
    const result = await service.getFlagVideoUrl({ companyId: req.auth.companyId, id: req.params.id });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function markReviewed(req, res, next) {
  try {
    const flag = await service.markFlagReviewed({
      companyId: req.auth.companyId,
      id: req.params.id,
      reviewedByUserId: req.auth.userId,
    });
    res.json({ data: flag });
  } catch (err) {
    next(err);
  }
}

async function uploadCapture(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'video file is required' });
    const result = await service.uploadFlagCapture({
      companyId: req.auth.companyId,
      kioskUserId: req.auth.userId,
      flagId: req.params.id,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, videoUrl, markReviewed, uploadCapture };
