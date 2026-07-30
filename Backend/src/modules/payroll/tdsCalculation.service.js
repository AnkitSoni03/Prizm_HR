'use strict';

// Pure calculation, no DB access — same convention as statutoryDeduction
// .service.js. New Tax Regime only (see CLAUDE.md): no employee investment
// declarations, so the only per-employee inputs are the annualized-
// projection figures payrollRun.service.js already has to hand.
function round2(amount) {
  return Math.round(amount * 100) / 100;
}

// slabs: ascending array of { upTo: number|null, rate: percent }. Each
// bracket is taxed only on the slice of taxableIncome that falls within it.
function computeAnnualTax(taxableIncome, slabs) {
  let tax = 0;
  let lowerBound = 0;
  for (const bracket of slabs) {
    if (taxableIncome <= lowerBound) break;
    const upTo = bracket.upTo === null ? taxableIncome : Math.min(bracket.upTo, taxableIncome);
    const sliceAmount = Math.max(0, upTo - lowerBound);
    tax += (sliceAmount * bracket.rate) / 100;
    lowerBound = bracket.upTo === null ? taxableIncome : bracket.upTo;
  }
  return tax;
}

// tds must already be resolved (see statutoryDefaults.js::resolveStatutoryConfig).
// projectedAnnualGross/taxAlreadyDeductedYtd/remainingMonths are computed by
// the caller from this run's taxable earnings plus this FY's prior payslips.
function computeTds({ tds }, { projectedAnnualGross, taxAlreadyDeductedYtd, remainingMonths }) {
  if (!tds.enabled) return null;

  const taxableIncome = Math.max(0, projectedAnnualGross - tds.standardDeduction);
  let annualTax = computeAnnualTax(taxableIncome, tds.slabs);

  if (taxableIncome <= tds.rebate87A.thresholdTaxableIncome) {
    annualTax = Math.max(0, annualTax - tds.rebate87A.maxRebate);
  }

  const totalAnnualTax = annualTax * (1 + tds.cessRate / 100);
  const remainingTax = totalAnnualTax - taxAlreadyDeductedYtd;
  const monthlyTds = remainingMonths > 0 ? Math.max(0, remainingTax / remainingMonths) : Math.max(0, remainingTax);

  const amount = round2(monthlyTds);
  if (amount <= 0) return null;

  return { key: 'statutory-tds', name: 'Tax Deducted at Source (TDS)', amount };
}

module.exports = { computeTds, computeAnnualTax };
