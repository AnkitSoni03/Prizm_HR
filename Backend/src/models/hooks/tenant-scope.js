'use strict';

const { getCompanyId } = require('../../config/tenant-context');

function mergeCompanyFilter(options) {
  const companyId = getCompanyId();
  if (companyId === undefined || companyId === null) return;

  options.where = options.where
    ? { ...options.where, company_id: companyId }
    : { company_id: companyId };
}

// Dynamic per-request replacement for a static `defaultScope`: Sequelize's
// defaultScope is evaluated once at model definition, so it can't react to
// a request-scoped company_id. These hooks re-derive the filter on every
// query from AsyncLocalStorage instead.
function applyTenantScope(Model) {
  Model.addHook('beforeFind', mergeCompanyFilter);
  Model.addHook('beforeCount', mergeCompanyFilter);
  Model.addHook('beforeBulkUpdate', mergeCompanyFilter);
  Model.addHook('beforeBulkDestroy', mergeCompanyFilter);
}

module.exports = { applyTenantScope };
