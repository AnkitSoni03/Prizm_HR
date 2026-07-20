'use strict';

// Pure calculation, no DB access — deliberately kept this way so it's
// directly unit-testable and so payrollRun.service.js's transaction/segment
// logic never has to think about statutory rules beyond "call this once
// gross/pfWageAmount are known". See statutoryDefaults.js for the config
// shape this expects (already merged with defaults via
// resolveStatutoryConfig before being passed in here).
function round2(amount) {
  return Math.round(amount * 100) / 100;
}

function computePf({ pf }, pfWageAmount) {
  if (!pf.enabled || pfWageAmount <= 0) return null;
  const pfBasis = pf.applyCeiling ? Math.min(pfWageAmount, pf.wageCeiling) : pfWageAmount;
  return {
    employee: { key: 'statutory-pf', name: 'Provident Fund (PF)', amount: round2((pfBasis * pf.employeeRate) / 100) },
    employer: { key: 'statutory-pf-employer', name: 'Provident Fund (PF) — Employer', amount: round2((pfBasis * pf.employerRate) / 100) },
  };
}

function computeEsi({ esi }, grossEarnings) {
  if (!esi.enabled || grossEarnings <= 0 || grossEarnings > esi.wageThreshold) return null;
  return {
    employee: { key: 'statutory-esi', name: 'Employee State Insurance (ESI)', amount: round2((grossEarnings * esi.employeeRate) / 100) },
    employer: { key: 'statutory-esi-employer', name: 'Employee State Insurance (ESI) — Employer', amount: round2((grossEarnings * esi.employerRate) / 100) },
  };
}

function computePt({ pt }, workState, grossEarnings) {
  if (!pt.enabled || grossEarnings <= 0) return null;
  const slabs = pt.slabs[workState] || pt.slabs.default;
  if (!slabs) return null;
  const bracket = slabs.find((b) => b.upTo === null || grossEarnings <= b.upTo);
  if (!bracket || bracket.amount <= 0) return null;
  return { employee: { key: 'statutory-pt', name: 'Professional Tax (PT)', amount: round2(bracket.amount) } };
}

// statutoryConfig must already be resolved (see
// statutoryDefaults.js::resolveStatutoryConfig) — this function does not
// apply defaults itself.
function computeStatutoryDeductions({ statutoryConfig, workState, pfWageAmount, grossEarnings }) {
  const employeeEntries = [];
  const employerEntries = [];

  const pf = computePf(statutoryConfig, pfWageAmount);
  if (pf) {
    employeeEntries.push(pf.employee);
    employerEntries.push(pf.employer);
  }

  const esi = computeEsi(statutoryConfig, grossEarnings);
  if (esi) {
    employeeEntries.push(esi.employee);
    employerEntries.push(esi.employer);
  }

  const pt = computePt(statutoryConfig, workState, grossEarnings);
  if (pt) employeeEntries.push(pt.employee);

  return { employeeEntries, employerEntries };
}

module.exports = { computeStatutoryDeductions };
