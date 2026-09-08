'use strict';

const { createLivenessSession } = require('../../utils/rekognition');

// Called by the kiosk right before it renders AWS's <FaceLivenessDetector>
// component — that component needs a fresh SessionId per attempt, minted
// server-side (never by the browser itself).
async function create(req, res, next) {
  try {
    const result = await createLivenessSession();
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { create };
