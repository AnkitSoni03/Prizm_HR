'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithTenant(store, callback) {
  return storage.run(store, callback);
}

function getTenantStore() {
  return storage.getStore();
}

function getCompanyId() {
  const store = storage.getStore();
  return store ? store.companyId : undefined;
}

// Runs `callback` as if the request belonged to `companyId` — every
// tenant-scoped model hook then filters to THAT company instead of the
// caller's own. Used where a request legitimately acts on a sibling company
// of the same Group (a cross-company manager deciding a report's leave/OD/
// comp-off — see utils/managerScope.js). Passing null switches the hook off
// entirely, so the caller must pin company_id in its own where clauses.
function runAsCompany(companyId, callback) {
  return storage.run({ ...(storage.getStore() || {}), companyId }, callback);
}

module.exports = { runWithTenant, getTenantStore, getCompanyId, runAsCompany };
