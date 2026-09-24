'use strict';

const { POWER_CATALOG } = require('../../config/powerCatalog');
const { allowedLevelsForCaller } = require('../../utils/powerAuthority');

// Each power carries `levels` (what it can ever be granted at) and
// `allowedLevels` (what THIS caller may grant — see utils/powerAuthority.js),
// so the assignment UI can disable what the server would reject anyway.
async function list(req, res, next) {
  try {
    const data = [];
    for (const power of POWER_CATALOG) {
      // eslint-disable-next-line no-await-in-loop
      data.push({ ...power, allowedLevels: await allowedLevelsForCaller(req.auth, power) });
    }
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
