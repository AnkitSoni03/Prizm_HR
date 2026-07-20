'use strict';

const db = require('../../models');

async function listPlans() {
  return db.Plan.findAll({ where: { isActive: true }, order: [['id', 'ASC']] });
}

module.exports = { listPlans };
