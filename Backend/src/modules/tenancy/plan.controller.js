'use strict';

const service = require('./plan.service');

async function list(req, res, next) {
  try {
    const plans = await service.listPlans();
    res.json({ data: plans });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
