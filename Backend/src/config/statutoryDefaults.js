'use strict';

// Sensible current-law defaults for India's PF/ESI/PT statutory deductions.
// Stored per-company in payroll_settings.statutory_config (JSONB, editable
// via Payroll Settings) rather than hardcoded — these rates/ceilings/slabs
// change periodically, and a settings edit is far cheaper than a redeploy.
// A company's statutory_config only needs to hold the fields it wants to
// override; resolveStatutoryConfig() merges the rest from here, so every
// existing company (statutory_config still {}) gets working defaults with
// zero backfill needed.
//
// PT slabs are a small illustrative set of common states plus a 'default'
// catch-all — real Professional Tax tables vary by state and change
// periodically (some states also have a distinct February slab, not
// modeled here). Companies needing an unlisted state or a different table
// can override `pt.slabs` directly in statutory_config.
const DEFAULT_STATUTORY_CONFIG = {
  pf: {
    enabled: true,
    employeeRate: 12, // % of PF wage
    employerRate: 12, // % of PF wage
    wageCeiling: 15000, // monthly; PF wage is capped here unless applyCeiling is false
    applyCeiling: true,
  },
  esi: {
    enabled: true,
    employeeRate: 0.75, // % of gross
    employerRate: 3.25, // % of gross
    wageThreshold: 21000, // monthly gross must be <= this for ESI to apply
  },
  pt: {
    enabled: true,
    slabs: {
      Karnataka: [
        { upTo: 15000, amount: 0 },
        { upTo: null, amount: 200 },
      ],
      Maharashtra: [
        { upTo: 7500, amount: 0 },
        { upTo: 10000, amount: 175 },
        { upTo: null, amount: 200 },
      ],
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
      default: [
        { upTo: 15000, amount: 0 },
        { upTo: null, amount: 200 },
      ],
    },
  },
};

// Shallow per-section merge — company overrides in statutory_config replace
// only the keys they set, everything else falls back to the default. Slabs
// merge one level deeper (per-state) so a company can add/override a single
// state's table without having to repeat every other state.
function resolveStatutoryConfig(companyOverride) {
  const override = companyOverride || {};
  return {
    pf: { ...DEFAULT_STATUTORY_CONFIG.pf, ...(override.pf || {}) },
    esi: { ...DEFAULT_STATUTORY_CONFIG.esi, ...(override.esi || {}) },
    pt: {
      ...DEFAULT_STATUTORY_CONFIG.pt,
      ...(override.pt || {}),
      slabs: { ...DEFAULT_STATUTORY_CONFIG.pt.slabs, ...((override.pt && override.pt.slabs) || {}) },
    },
  };
}

module.exports = { DEFAULT_STATUTORY_CONFIG, resolveStatutoryConfig };
