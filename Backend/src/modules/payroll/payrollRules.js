'use strict';

const { HttpError } = require('../../utils/errors');

// ---------------------------------------------------------------------------
// Salary template rules (payroll_templates.rules) — every rate, cap and
// on/off switch is the template owner's to change, so each company follows
// its own policy. Defaults are current Indian law (rates as of 2026); they
// are only a starting point for a new template.
//
// Everything starts from the employee's monthly GROSS salary:
//   Basic   = basicPercentOfGross % of Gross
//   HRA     = hraPercentOfBasic % of Basic
//   Allowances = the recurring 'earning' items chosen for the employee
//   Special allowance = Gross − Basic − HRA − allowances (balancing figure)
//   In-hand = Gross − employee deductions (PF, ESI, PT, LWF, TDS, custom)
//             + one-time bonuses of the month (never prorated)
//   Employer contributions (employer PF, EDLI, PF admin, gratuity, employer
//            ESI/LWF, custom ones) are the company's cost ON TOP of gross,
//            never taken from it: total cost = Gross + employer contributions.
//
// Each deduction/contribution has its own `enabled` toggle here, and every
// employee's salary assignment can switch any of them off again (or all of
// them at once — then in-hand = Gross).
// ---------------------------------------------------------------------------

const DEFAULT_RULES = {
  basicPercentOfGross: 50,
  hraPercentOfBasic: 40,
  // Holiday / week-off between two leaves also counts as leave
  // (modules/payroll/sandwichRule.js).
  sandwichRule: false,
  deductions: {
    pf: { enabled: true, rate: 12, ceiling: 15000, applyCeiling: true },
    esi: { enabled: true, rate: 0.75, grossLimit: 21000 },
    // mode 'state' = the employee's work state slab (PT_SLABS below);
    // 'fixed' = fixedAmount every month for everyone.
    pt: { enabled: true, mode: 'state', fixedAmount: 200 },
    lwf: { enabled: false, amount: 0 },
    // New tax regime, annualised projection — no % to edit, only on/off.
    tds: { enabled: false },
  },
  employer: {
    // epsRate is the part of employer PF that goes to the pension (EPS);
    // the rest goes to the EPF account. Display only.
    pf: { enabled: true, rate: 12, epsRate: 8.33, ceiling: 15000, applyCeiling: true },
    edli: { enabled: true, rate: 0.5, ceiling: 15000 },
    pfAdmin: { enabled: true, rate: 0.5, ceiling: 15000 },
    gratuity: { enabled: true, rate: 4.81 },
    esi: { enabled: true, rate: 3.25, grossLimit: 21000 },
    lwf: { enabled: false, amount: 0 },
  },
  // Legacy: extra items used to be switched per template. They now apply to
  // the employees chosen on the item (payroll_custom_item_employees); kept
  // empty so old templates still load.
  customItems: {},
};

// Item keys an employee assignment can switch off (salary_assignments.disabled_items).
const BUILT_IN_ITEMS = [
  { key: 'pf', kind: 'deduction', label: 'Employee PF' },
  { key: 'esi', kind: 'deduction', label: 'Employee ESI' },
  { key: 'pt', kind: 'deduction', label: 'Professional Tax' },
  { key: 'lwf', kind: 'deduction', label: 'Labour Welfare Fund' },
  { key: 'tds', kind: 'deduction', label: 'Income Tax (TDS)' },
  { key: 'employer_pf', kind: 'employer_contribution', label: 'Employer PF (EPF + EPS)' },
  { key: 'edli', kind: 'employer_contribution', label: 'EDLI' },
  { key: 'pf_admin', kind: 'employer_contribution', label: 'EPF admin charges' },
  { key: 'gratuity', kind: 'employer_contribution', label: 'Gratuity provision' },
  { key: 'employer_esi', kind: 'employer_contribution', label: 'Employer ESI' },
  { key: 'employer_lwf', kind: 'employer_contribution', label: 'Employer LWF' },
];
const customItemKey = (id) => `custom_${id}`;

// One-time extra pay (payroll_bonuses.type). Reimbursements are not income,
// so a new one defaults to not taxable; the rest default to taxable.
const BONUS_TYPES = [
  { key: 'bonus', label: 'Bonus', taxable: true },
  { key: 'incentive', label: 'Incentive', taxable: true },
  { key: 'overtime', label: 'Overtime', taxable: true },
  { key: 'reimbursement', label: 'Reimbursement', taxable: false },
  { key: 'other', label: 'Other', taxable: true },
];
const BASIS_LABEL = { basic: 'Basic', gross: 'Gross' };
const BASES = Object.keys(BASIS_LABEL);

// Monthly Professional Tax by gross salary. States not listed levy no PT
// (Delhi, Haryana, Uttar Pradesh, Rajasthan, …). Simplified to a flat monthly
// figure (e.g. Maharashtra's ₹300 February top-up isn't modelled) — a company
// whose policy differs can switch the template to a fixed amount.
const PT_SLABS = {
  Karnataka: [{ upTo: 24999, amount: 0 }, { upTo: null, amount: 200 }],
  Maharashtra: [{ upTo: 7500, amount: 0 }, { upTo: 10000, amount: 175 }, { upTo: null, amount: 200 }],
  'West Bengal': [
    { upTo: 10000, amount: 0 },
    { upTo: 15000, amount: 110 },
    { upTo: 25000, amount: 130 },
    { upTo: 40000, amount: 150 },
    { upTo: null, amount: 200 },
  ],
  'Tamil Nadu': [
    { upTo: 21000, amount: 0 },
    { upTo: 30000, amount: 135 },
    { upTo: 45000, amount: 315 },
    { upTo: 60000, amount: 690 },
    { upTo: 75000, amount: 1025 },
    { upTo: null, amount: 1250 },
  ],
  Telangana: [{ upTo: 15000, amount: 0 }, { upTo: 20000, amount: 150 }, { upTo: null, amount: 200 }],
  'Andhra Pradesh': [{ upTo: 15000, amount: 0 }, { upTo: 20000, amount: 150 }, { upTo: null, amount: 200 }],
  Gujarat: [{ upTo: 11999, amount: 0 }, { upTo: null, amount: 200 }],
  'Madhya Pradesh': [
    { upTo: 18750, amount: 0 },
    { upTo: 25000, amount: 125 },
    { upTo: 33333, amount: 167 },
    { upTo: null, amount: 208 },
  ],
  Odisha: [{ upTo: 13304, amount: 0 }, { upTo: 25000, amount: 125 }, { upTo: null, amount: 200 }],
  Assam: [{ upTo: 15000, amount: 0 }, { upTo: 25000, amount: 180 }, { upTo: null, amount: 208 }],
};

// New tax regime, FY 2025-26 onwards.
const TDS_NEW_REGIME = {
  standardDeduction: 75000,
  cessRate: 4,
  rebateLimit: 1200000, // §87A: no tax up to this taxable income
  slabs: [
    { upTo: 400000, rate: 0 },
    { upTo: 800000, rate: 5 },
    { upTo: 1200000, rate: 10 },
    { upTo: 1600000, rate: 15 },
    { upTo: 2000000, rate: 20 },
    { upTo: 2400000, rate: 25 },
    { upTo: null, rate: 30 },
  ],
};

const rupee = (n) => Math.round(Number(n) || 0);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Validation — merges onto the defaults so a partial body works, and rejects
// anything that would make the maths meaningless.
// ---------------------------------------------------------------------------
function num(value, label, { min = 0, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${label} must be a number between ${min} and ${max === Infinity ? 'any amount' : max}`);
  }
  return n;
}

function mergeSection(defaults, input, labelPrefix, numericLimits) {
  const out = {};
  for (const [key, def] of Object.entries(defaults)) {
    const given = isObj(input) && isObj(input[key]) ? input[key] : {};
    const merged = { ...def, ...given };
    const clean = { enabled: merged.enabled !== false };
    for (const [field, defValue] of Object.entries(def)) {
      if (field === 'enabled') continue;
      if (typeof defValue === 'boolean') clean[field] = merged[field] !== false && merged[field] !== 'false';
      else if (typeof defValue === 'number') {
        const max = (numericLimits[field] ?? Infinity);
        clean[field] = num(merged[field], `${labelPrefix} ${key} ${field}`, { max });
      } else clean[field] = merged[field];
    }
    out[key] = clean;
  }
  return out;
}

const RATE_FIELDS = { rate: 100, epsRate: 100 };

function normalizeRules(input) {
  const src = isObj(input) ? input : {};
  // basicPercentOfCtc: the key before salaries became gross-based.
  const basicPercent = src.basicPercentOfGross ?? src.basicPercentOfCtc ?? DEFAULT_RULES.basicPercentOfGross;
  const rules = {
    basicPercentOfGross: num(basicPercent, 'Basic % of Gross', { min: 1, max: 100 }),
    hraPercentOfBasic: num(src.hraPercentOfBasic ?? DEFAULT_RULES.hraPercentOfBasic, 'HRA % of Basic', { max: 100 }),
    sandwichRule: src.sandwichRule === true,
    deductions: mergeSection(DEFAULT_RULES.deductions, src.deductions, 'Deduction', RATE_FIELDS),
    employer: mergeSection(DEFAULT_RULES.employer, src.employer, 'Employer', RATE_FIELDS),
    customItems: {},
  };
  if (!['state', 'fixed'].includes(rules.deductions.pt.mode)) {
    throw new HttpError(400, "Professional Tax mode must be 'state' or 'fixed'");
  }
  if (rules.basicPercentOfGross * (1 + rules.hraPercentOfBasic / 100) > 100) {
    throw new HttpError(400, 'Basic + HRA would be more than the gross salary — lower the Basic or HRA %');
  }
  if (rules.employer.pf.epsRate > rules.employer.pf.rate) {
    throw new HttpError(400, 'Employer PF pension (EPS) % cannot be more than the employer PF %');
  }
  return rules;
}

// Custom items as they apply under one template: [{ id, key, name, kind,
// calcType, basis, value, enabled }]. `items` = the Group's active
// payroll_custom_items (plain objects).
function resolveCustomItems(rules, items) {
  return (items || []).map((item) => {
    return {
      id: String(item.id),
      key: customItemKey(item.id),
      name: item.name,
      kind: item.kind,
      calcType: item.calcType,
      basis: item.basis,
      value: Number(item.value),
      enabled: true,
    };
  });
}

function ptForGross(ptRule, workState, gross) {
  if (gross <= 0) return 0;
  if (ptRule.mode === 'fixed') return rupee(ptRule.fixedAmount);
  const slabs = PT_SLABS[workState];
  if (!slabs) return 0;
  const bracket = slabs.find((b) => b.upTo === null || gross <= b.upTo);
  return bracket ? bracket.amount : 0;
}

function annualTaxNewRegime(annualGross) {
  const taxable = Math.max(0, annualGross - TDS_NEW_REGIME.standardDeduction);
  if (taxable <= TDS_NEW_REGIME.rebateLimit) return 0;
  let tax = 0;
  let lower = 0;
  for (const slab of TDS_NEW_REGIME.slabs) {
    if (taxable <= lower) break;
    const upper = slab.upTo === null ? taxable : Math.min(slab.upTo, taxable);
    tax += ((upper - lower) * slab.rate) / 100;
    lower = slab.upTo === null ? taxable : slab.upTo;
  }
  // Marginal relief just above the rebate limit: tax can't exceed the income
  // earned above the limit.
  tax = Math.min(tax, taxable - TDS_NEW_REGIME.rebateLimit);
  return tax * (1 + TDS_NEW_REGIME.cessRate / 100);
}

// ---------------------------------------------------------------------------
// The calculation. Pure — every DB-derived input is passed in.
//
//   monthlyGross      salary_assignments.monthly_gross
//   rules             normalized template rules
//   customItems       resolveCustomItems(rules, items) — this employee's
//   deductionsEnabled / disabledItems — the employee's own switches
//   workState         employees.work_state (PT)
//   paidDays / monthDays — attendance result; 1/1 for the full-month preview
//   tds               { ytdGross, ytdTds, remainingMonths } — this financial
//                     year's earlier months; omit for the preview
//   earnedOverride    { basic, hra, gross, allowances: { [key]: amt } }
//                     — this month's earned amounts when they don't come
//                     from one salary alone (a mid-month revision:
//                     payrollEngine.js adds up each part); deductions are
//                     then worked out once on the total
//   bonuses           [{ id, type, title, amount, taxable, calcType,
//                     percent, basis }] — the month's one-time extras
//                     (payroll_bonuses); a 'percent' one is worked out on the
//                     full monthly Basic / Gross. Paid in full on top of the
//                     salary: no LOP cut, no PF/ESI/PT; taxable ones count
//                     for TDS, taxed in the month they're paid.
// ---------------------------------------------------------------------------
function computeSalary({
  monthlyGross,
  rules,
  customItems = [],
  deductionsEnabled = true,
  disabledItems = [],
  workState = null,
  paidDays = 1,
  monthDays = 1,
  tds = null,
  earnedOverride = null,
  bonuses = [],
}) {
  let gross = rupee(monthlyGross);
  const disabled = new Set(disabledItems || []);
  const on = (key, rule) => deductionsEnabled && rule && rule.enabled && !disabled.has(key);
  // Extra items (allowances, deductions, employer contributions) are given
  // to chosen employees on purpose — the "no deductions" switch and the
  // template don't touch them; `customItems` holds only this employee's.
  const D = rules.deductions;
  const E = rules.employer;
  const capped = (base, rule) => (rule.applyCeiling === false || rule.ceiling === undefined ? base : Math.min(base, rule.ceiling));
  const pct = (base, rate) => (base * rate) / 100;
  const warnings = [];

  // ---- Full-month structure ------------------------------------------------
  const basic = rupee(pct(gross, rules.basicPercentOfGross));
  const hra = rupee(pct(basic, rules.hraPercentOfBasic));
  const activeCustom = customItems.filter((item) => item.kind !== 'earning' && item.enabled);
  const activeEarnings = customItems.filter((item) => item.kind === 'earning' && item.enabled);
  const allowances = activeEarnings.map((item) => ({
    item,
    full: item.calcType === 'fixed' ? rupee(item.value) : rupee(pct(({ basic, gross }[item.basis] || 0), item.value)),
  }));
  const allowanceTotal = allowances.reduce((s, a) => s + a.full, 0);
  let special = gross - basic - hra - allowanceTotal;
  // Assigning a salary / an allowance is refused when this happens
  // (salaryFit.js); an older salary still computes, with a warning.
  const overflow = special < 0;
  if (overflow) {
    warnings.push('Basic + HRA + allowances are more than the gross salary — lower the allowances or the Basic / HRA %');
    special = 0;
    gross = basic + hra + allowanceTotal;
  }

  // ---- This month (prorated by paid days) ---------------------------------
  const factor = monthDays > 0 ? Math.max(0, Math.min(1, paidDays / monthDays)) : 1;
  const basicE = earnedOverride ? rupee(earnedOverride.basic) : rupee(basic * factor);
  const hraE = earnedOverride ? rupee(earnedOverride.hra) : rupee(hra * factor);
  const grossE = earnedOverride ? rupee(earnedOverride.gross) : rupee(gross * factor);
  const allowanceRows = allowances.map(({ item, full }) => ({
    key: item.key,
    name: item.name,
    rule: item.calcType === 'fixed' ? 'Fixed monthly' : `${item.value}% of ${BASIS_LABEL[item.basis] || 'Basic'}`,
    full,
    amount: earnedOverride ? rupee((earnedOverride.allowances || {})[item.key] || 0) : rupee(full * factor),
  }));
  const allowanceTotalE = allowanceRows.reduce((s, a) => s + a.amount, 0);
  const specialE = Math.max(0, grossE - basicE - hraE - allowanceTotalE);
  const worked = grossE > 0;

  const earnings = [
    { key: 'basic', name: 'Basic salary', rule: `${rules.basicPercentOfGross}% of Gross`, full: basic, amount: basicE },
    { key: 'hra', name: 'House Rent Allowance', rule: `${rules.hraPercentOfBasic}% of Basic`, full: hra, amount: hraE },
    ...allowanceRows,
    { key: 'special', name: 'Special allowance', rule: 'Balancing figure', full: special, amount: specialE },
  ];

  const typeLabel = (type) => (BONUS_TYPES.find((t) => t.key === type) || { label: 'Extra pay' }).label;
  const bonusBase = { basic, gross };
  const bonusRows = (bonuses || [])
    .map((b) => {
      const isPercent = b.calcType === 'percent';
      const amount = isPercent
        ? Math.round((bonusBase[b.basis] || 0) * (Number(b.percent) || 0)) / 100
        : Math.round((Number(b.amount) || 0) * 100) / 100;
      return {
        id: b.id === undefined || b.id === null ? null : String(b.id),
        key: `bonus_${b.id}`,
        type: b.type,
        name: b.title ? `${typeLabel(b.type)} — ${b.title}` : typeLabel(b.type),
        rule: isPercent ? `${Number(b.percent)}% of monthly ${BASIS_LABEL[b.basis] || 'Basic'}` : 'Fixed amount',
        calcType: isPercent ? 'percent' : 'fixed',
        amount,
        taxable: b.taxable !== false,
      };
    })
    .filter((b) => b.amount > 0);
  const bonusTotal = Math.round(bonusRows.reduce((s, b) => s + b.amount, 0) * 100) / 100;
  const taxableBonus = Math.round(bonusRows.filter((b) => b.taxable).reduce((s, b) => s + b.amount, 0) * 100) / 100;

  // A custom item worked out on Basic / Gross, or a fixed monthly amount
  // (taken only in a month with some pay).
  const customRow = (item) => {
    const base = { basic: [basic, basicE], gross: [gross, grossE] }[item.basis] || [0, 0];
    return item.calcType === 'fixed'
      ? { rule: 'Fixed monthly', full: item.value, amount: worked ? item.value : 0 }
      : { rule: `${item.value}% of ${BASIS_LABEL[item.basis] || 'Basic'}`, full: pct(base[0], item.value), amount: pct(base[1], item.value) };
  };

  const deductions = [];
  const addDeduction = (key, name, rule, full, amount) => deductions.push({ key, name, rule, full: rupee(full), amount: rupee(amount) });

  if (on('pf', D.pf)) {
    addDeduction('pf', 'Employee PF', `${D.pf.rate}% of ${D.pf.applyCeiling ? `Basic (max ₹${D.pf.ceiling})` : 'Basic'}`,
      pct(capped(basic, D.pf), D.pf.rate), pct(capped(basicE, D.pf), D.pf.rate));
  }
  if (on('esi', D.esi) && gross <= D.esi.grossLimit) {
    // ESI contributions round UP to the next rupee.
    deductions.push({
      key: 'esi', name: 'Employee ESI', rule: `${D.esi.rate}% of Gross (gross ≤ ₹${D.esi.grossLimit})`,
      full: Math.ceil(pct(gross, D.esi.rate)), amount: Math.ceil(pct(grossE, D.esi.rate)),
    });
  }
  if (on('pt', D.pt) && D.pt.mode === 'state' && !workState) {
    warnings.push('Work state is not set for this employee — Professional Tax is not deducted');
  }
  if (on('pt', D.pt)) {
    const full = ptForGross(D.pt, workState, gross);
    const amount = ptForGross(D.pt, workState, grossE);
    if (full > 0 || amount > 0) {
      addDeduction('pt', 'Professional Tax', D.pt.mode === 'fixed' ? 'Fixed monthly' : `${workState || 'Work state'} slab`, full, amount);
    }
  }
  if (on('lwf', D.lwf) && D.lwf.amount > 0) addDeduction('lwf', 'Labour Welfare Fund', 'Fixed monthly', D.lwf.amount, worked ? D.lwf.amount : 0);
  for (const item of activeCustom.filter((i) => i.kind === 'deduction')) {
    const row = customRow(item);
    addDeduction(item.key, item.name, row.rule, row.full, row.amount);
  }
  if (on('tds', D.tds)) {
    // Annualised projection: this FY's earlier months + this month + the
    // full monthly gross for every month still to come.
    // A taxable bonus is one-time income: the extra tax it causes is taken
    // in full this month, not spread over the rest of the year.
    const remaining = tds ? tds.remainingMonths : 12;
    const projected = (tds ? tds.ytdGross : 0) + grossE + gross * Math.max(0, remaining - 1);
    const annual = annualTaxNewRegime(projected);
    const bonusTax = taxableBonus > 0 ? annualTaxNewRegime(projected + taxableBonus) - annual : 0;
    const fullMonthly = annualTaxNewRegime(gross * 12) / 12;
    const amount = Math.max(0, (annual - (tds ? tds.ytdTds : 0)) / Math.max(1, remaining)) + bonusTax;
    if (fullMonthly > 0 || amount > 0) addDeduction('tds', 'Income Tax (TDS)', 'New tax regime', fullMonthly, amount);
  }

  // Employer contributions — the company's cost on top of gross.
  const employer = [];
  const addEmployer = (key, name, rule, full, amount) => employer.push({ key, name, rule, full: rupee(full), amount: rupee(amount) });
  if (on('employer_pf', E.pf)) {
    addEmployer('employer_pf', 'Employer PF (EPS + EPF)', `${E.pf.rate}% of ${E.pf.applyCeiling ? `Basic (max ₹${E.pf.ceiling})` : 'Basic'}`,
      pct(capped(basic, E.pf), E.pf.rate), pct(capped(basicE, E.pf), E.pf.rate));
  }
  if (on('edli', E.edli)) addEmployer('edli', 'EDLI', `${E.edli.rate}% of Basic (max ₹${E.edli.ceiling})`, pct(Math.min(basic, E.edli.ceiling), E.edli.rate), pct(Math.min(basicE, E.edli.ceiling), E.edli.rate));
  if (on('pf_admin', E.pfAdmin)) addEmployer('pf_admin', 'EPF admin charges', `${E.pfAdmin.rate}% of Basic (max ₹${E.pfAdmin.ceiling})`, pct(Math.min(basic, E.pfAdmin.ceiling), E.pfAdmin.rate), pct(Math.min(basicE, E.pfAdmin.ceiling), E.pfAdmin.rate));
  if (on('gratuity', E.gratuity)) addEmployer('gratuity', 'Gratuity provision', `${E.gratuity.rate}% of Basic`, pct(basic, E.gratuity.rate), pct(basicE, E.gratuity.rate));
  if (on('employer_esi', E.esi) && gross <= E.esi.grossLimit) {
    employer.push({
      key: 'employer_esi', name: 'Employer ESI', rule: `${E.esi.rate}% of Gross (gross ≤ ₹${E.esi.grossLimit})`,
      full: Math.ceil(pct(gross, E.esi.rate)), amount: Math.ceil(pct(grossE, E.esi.rate)),
    });
  }
  if (on('employer_lwf', E.lwf) && E.lwf.amount > 0) addEmployer('employer_lwf', 'Employer LWF', 'Fixed monthly', E.lwf.amount, worked ? E.lwf.amount : 0);
  for (const item of activeCustom.filter((i) => i.kind === 'employer_contribution')) {
    const row = customRow(item);
    addEmployer(item.key, item.name, row.rule, row.full, row.amount);
  }

  const sum = (rows, field) => rows.reduce((s, r) => s + r[field], 0);
  const totalDeductionsFull = sum(deductions, 'full');
  const totalDeductions = sum(deductions, 'amount');
  const totalEmployerFull = sum(employer, 'full');
  const totalEmployer = sum(employer, 'amount');

  // PF passbook view: employee PF + employer PF split into EPF / EPS.
  let pfSplit = null;
  const empPf = deductions.find((d) => d.key === 'pf');
  const erPf = employer.find((d) => d.key === 'employer_pf');
  if (empPf || erPf) {
    const epsOf = (b) => rupee(pct(Math.min(b, E.pf.ceiling), E.pf.epsRate));
    const split = (erAmount, b) => {
      const eps = erAmount ? Math.min(erAmount, epsOf(b)) : 0;
      return { eps, employerEpf: (erAmount || 0) - eps };
    };
    const full = split(erPf ? erPf.full : 0, basic);
    const actual = split(erPf ? erPf.amount : 0, basicE);
    pfSplit = {
      epsRate: E.pf.epsRate,
      full: { employeeEpf: empPf ? empPf.full : 0, employerEpf: full.employerEpf, eps: full.eps },
      actual: { employeeEpf: empPf ? empPf.amount : 0, employerEpf: actual.employerEpf, eps: actual.eps },
    };
  }

  // Code on Wages: wages (Basic + DA) should be at least 50% of the pay.
  const wageRule = { basic, gross, percent: gross > 0 ? Math.round((basic / gross) * 1000) / 10 : 0, compliant: gross <= 0 || basic * 2 >= gross };

  return {
    monthlyGross: gross,
    factor,
    full: {
      grossSalary: gross,
      totalDeductions: totalDeductionsFull,
      totalEmployer: totalEmployerFull,
      inHand: gross - totalDeductionsFull,
      totalCost: gross + totalEmployerFull,
    },
    actual: {
      grossSalary: grossE,
      bonusTotal,
      taxableBonus,
      totalEarnings: grossE + bonusTotal,
      totalDeductions,
      totalEmployer,
      inHand: grossE + bonusTotal - totalDeductions,
      totalCost: grossE + bonusTotal + totalEmployer,
    },
    earnings,
    bonuses: bonusRows,
    deductions,
    employer,
    pfSplit,
    wageRule,
    overflow,
    warnings,
  };
}

module.exports = {
  DEFAULT_RULES,
  BUILT_IN_ITEMS,
  BONUS_TYPES,
  BASES,
  PT_SLABS,
  TDS_NEW_REGIME,
  customItemKey,
  normalizeRules,
  resolveCustomItems,
  computeSalary,
  annualTaxNewRegime,
};
