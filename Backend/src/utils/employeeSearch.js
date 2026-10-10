'use strict';

const { Op } = require('sequelize');

// Case-insensitive "contains" match on an employee's name or employee code,
// for list pages' search boxes — merged into an Employee include's `where`.
// Returns {} for an empty search so callers can spread it unconditionally.
// LIKE wildcards in the user's text are escaped so "50%" matches literally.
function employeeSearchWhere(search) {
  const term = typeof search === 'string' ? search.trim() : '';
  if (!term) return {};
  const pattern = `%${term.replace(/[\%_]/g, (ch) => `\${ch}`)}%`;
  return {
    [Op.or]: [{ name: { [Op.iLike]: pattern } }, { employeeCode: { [Op.iLike]: pattern } }],
  };
}

module.exports = { employeeSearchWhere };
