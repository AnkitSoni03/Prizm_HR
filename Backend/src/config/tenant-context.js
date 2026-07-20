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

module.exports = { runWithTenant, getTenantStore, getCompanyId };
