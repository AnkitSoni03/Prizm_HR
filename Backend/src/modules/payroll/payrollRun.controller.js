'use strict';

const service = require('./payrollRun.service');
const payslipService = require('./payslip.service');
const { listApprovalHistory } = require('../../utils/approvalHistory');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listRuns({ companyId: req.auth.companyId, limit, offset });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const run = await service.getRunForRead({ companyId: req.auth.companyId, id: req.params.id });
    res.json({ data: run });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { periodMonth, periodYear } = req.body;
    if (!periodMonth || !periodYear) {
      return res.status(400).json({ error: 'periodMonth and periodYear are required' });
    }
    const run = await service.createDraftRun({ companyId: req.auth.companyId, periodMonth, periodYear });
    res.status(201).json({ data: run });
  } catch (err) {
    next(err);
  }
}

async function process(req, res, next) {
  try {
    const run = await service.processRun({ companyId: req.auth.companyId, id: req.params.id, actorUserId: req.auth.userId });
    res.json({ data: run });
  } catch (err) {
    next(err);
  }
}

async function pay(req, res, next) {
  try {
    const run = await service.markPaid({ companyId: req.auth.companyId, id: req.params.id, actorUserId: req.auth.userId });
    res.json({ data: run });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const run = await service.cancelRun({ companyId: req.auth.companyId, id: req.params.id });
    res.json({ data: run });
  } catch (err) {
    next(err);
  }
}

async function listPayslips(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await payslipService.listPayslipsForRun({
      companyId: req.auth.companyId,
      payrollRunId: req.params.id,
      limit,
      offset,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function history(req, res, next) {
  try {
    const rows = await listApprovalHistory({
      companyId: req.auth.companyId,
      requestType: 'payroll_run',
      requestId: req.params.id,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, process, pay, cancel, listPayslips, history };
