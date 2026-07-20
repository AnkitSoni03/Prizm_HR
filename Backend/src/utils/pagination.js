'use strict';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query) {
  const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

module.exports = { parsePagination };
