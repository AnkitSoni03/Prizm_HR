'use strict';

const { runProbationConversions } = require('../modules/org/probationConversion.service');

// Daily (src/server.js, plus once on boot). The day after a Probation/Intern
// period ends, an employee with a queued Roster (employees.next_roster_group_id)
// becomes Full-time and moves to that Roster, carrying their leave forward —
// see modules/org/probationConversion.service.js. Idempotent: a converted
// employee is no longer Probation/Intern and drops out of the query.
module.exports = { runProbationConversions };
