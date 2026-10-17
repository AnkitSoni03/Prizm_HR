'use strict';

// One assigned leave type as export cells: Assigned / Carried Fwd / Used /
// Balance, plus a note (unlimited, linked type, current period).
function leaveBalanceCells(b, fmt) {
  const period = b.periodStart ? `${fmt(b.periodStart)} – ${b.periodEnd ? fmt(b.periodEnd) : 'open'}` : '';
  const note = b.linkedToName
    ? `Uses ${b.linkedToName} balance`
    : [b.isUnlimited ? 'Unlimited' : null, period ? `Period ${period}` : null].filter(Boolean).join(' · ');
  return [
    `${b.leaveTypeName}${b.isPaid === false ? ' (unpaid)' : ''}`,
    b.isUnlimited ? 'Unlimited' : b.allotted,
    b.carriedForward ?? 0,
    b.used ?? 0,
    b.isUnlimited ? 'Unlimited' : b.balance,
    note,
  ];
}

module.exports = { leaveBalanceCells };
