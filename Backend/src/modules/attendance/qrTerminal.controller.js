'use strict';

const service = require('./qrTerminal.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listTerminals({ limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const terminal = await service.getTerminalForRead(req.params.id);
    res.json({ data: terminal });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { brandId, terminalCode, rotationSeconds } = req.body;
    if (!terminalCode) {
      return res.status(400).json({ error: 'terminalCode is required' });
    }

    const terminal = await service.createTerminal({
      companyId: req.auth.companyId,
      brandId,
      terminalCode,
      rotationSeconds,
    });
    res.status(201).json({ data: terminal });
  } catch (err) {
    next(err);
  }
}

// Unauthenticated (no requireAuth on this route) — the terminal device
// authenticates itself via X-Terminal-Secret, not a user JWT.
async function rotate(req, res, next) {
  try {
    const presentedSecret = req.headers['x-terminal-secret'];
    if (!presentedSecret) {
      return res.status(401).json({ error: 'X-Terminal-Secret header is required' });
    }

    const result = await service.rotateQrToken({
      terminalCode: req.params.terminalCode,
      presentedSecret,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, rotate };
