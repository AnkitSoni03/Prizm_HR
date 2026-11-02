'use strict';

// 'monthly' accrual credits annualQuota/12 per month. When an admin changes
// the quota, months already credited (up to and including the current one)
// keep the old rate; the new rate applies from next month. The policy's
// quota_history records that: [{ from: 'YYYY-MM', annualQuota }], sorted.
// Pure — no DB access.

const pad = (n) => String(n).padStart(2, '0');

function ymOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

function nextYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

function hasQuotaHistory(policy) {
  return Array.isArray(policy?.quotaHistory) && policy.quotaHistory.length > 0;
}

// Yearly quota in force for month ym.
function quotaForMonth(policy, ym) {
  let rate = null;
  if (hasQuotaHistory(policy)) {
    for (const entry of policy.quotaHistory) {
      if (entry.from <= ym) rate = Number(entry.annualQuota);
    }
  }
  return rate ?? Number(policy.annualQuota);
}

// Sum of monthly credits for months fromYm..untilYm (inclusive), unrounded.
function monthlyAccrualSum(policy, fromYm, untilYm) {
  let total = 0;
  for (let ym = fromYm; ym <= untilYm; ym = nextYm(ym)) {
    total += quotaForMonth(policy, ym) / 12;
  }
  return total;
}

// New quota_history after changing a 'monthly' policy's quota on todayStr.
// The first change records the old rate as the baseline for every earlier
// month. A second change in the same month replaces that month's pending
// entry (the current month always keeps the rate it started with).
function historyAfterQuotaChange({ policy, newQuota, todayStr }) {
  const from = nextYm(ymOf(todayStr));
  const history = hasQuotaHistory(policy)
    ? policy.quotaHistory.filter((e) => e.from < from)
    : [{ from: '0000-01', annualQuota: Number(policy.annualQuota) }];
  history.push({ from, annualQuota: Number(newQuota) });
  return history;
}

module.exports = { ymOf, nextYm, hasQuotaHistory, quotaForMonth, monthlyAccrualSum, historyAfterQuotaChange };
