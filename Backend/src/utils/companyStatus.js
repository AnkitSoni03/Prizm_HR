'use strict';

// Statuses that mean "the platform is not currently providing service to
// this company" — a Super Admin's activate/deactivate toggle (CompanyCard.tsx)
// flips a company between 'active' and 'suspended'; 'terminated' is the same
// "blocked" bucket for a harder-stop status set via the full Edit Company
// status dropdown. 'trial'/'grace' still get service. Shared by
// auth.middleware.js (blocks every request) and auth.service.js::login
// (gives a specific reason at the login screen itself).
const INACTIVE_COMPANY_STATUSES = new Set(['suspended', 'terminated']);

function isCompanyInactive(status) {
  return INACTIVE_COMPANY_STATUSES.has(status);
}

module.exports = { isCompanyInactive };
