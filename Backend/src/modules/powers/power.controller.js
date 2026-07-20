'use strict';

const { POWER_CATALOG } = require('../../config/powerCatalog');

async function list(req, res) {
  res.json({ data: POWER_CATALOG });
}

module.exports = { list };
