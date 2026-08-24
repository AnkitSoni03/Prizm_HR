'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { getEmployeeForWrite } = require('./employee.service');
const { computeAllottedForPolicy } = require('../leave/leaveBalance.service');
const { resolveLeaveCycle } = require('../../utils/leaveCycle');
const { dateOnly, toBusinessLocal } = require('../../utils/dateRange');

async function assertRosterGroupBelongsToCompany(id, companyId) {
  if (id === null || id === undefined) return;
  const row = await db.RosterGroup.findOne({ where: { id, companyId } });
  if (!row) throw new HttpError(400, 'Roster Group not found for this company');
}

// Leave types a Roster Group actually governs, keyed by leaveTypeId (string)
// -> its LeavePolicy row. Includes monthly_reset types too — CLAUDE.md's own
// "Roster is the SOLE determinant of which LeavePolicy governs an employee"
// invariant applies to every accrual type; monthly_reset only changes HOW
// the reset/carry-forward decision below is applied (current month's row
// instead of the year row, no carry-forward-to-a-bucket), never WHETHER it
// applies.
async function loadRosterLeaveTypeMap(rosterGroupId) {
  const map = new Map();
  if (!rosterGroupId) return map;

  const links = await db.RosterGroupLeavePolicy.findAll({
    where: { rosterGroupId },
    include: [{ model: db.LeavePolicy, as: 'leavePolicy' }],
  });
  for (const link of links) {
    map.set(String(link.leaveTypeId), link.leavePolicy);
  }
  return map;
}

// Finds (or lazily creates) the company-wide "Carry Forward - <name>" bucket
// LeaveType for a given original leave type, and makes sure it's usable
// under targetRosterGroupId — a LeavePolicy (annualQuota 0: this policy only
// exists so resolveLeavePolicy/applicableAfterDays eligibility has something
// to find, per the "carried-forward balance follows normal policy rules"
// decision; the actual carried amount is credited directly onto the balance
// row below, not accrued through this policy) plus a RosterGroupLeavePolicy
// link so the new Roster actually governs it. Reused across repeated roster
// changes for the same original type (via sourceLeaveTypeId), so an
// employee doesn't accumulate a fresh duplicate bucket every time.
async function findOrCreateCarryForwardBucket({ companyId, sourceLeaveType, targetRosterGroupId, transaction }) {
  let cfType = await db.LeaveType.findOne({
    where: { companyId, sourceLeaveTypeId: sourceLeaveType.id, isCarryForwardBucket: true },
    transaction,
  });
  if (!cfType) {
    try {
      cfType = await db.LeaveType.create(
        {
          companyId,
          code: `CF_${sourceLeaveType.code}`.slice(0, 250),
          name: `Carry Forward - ${sourceLeaveType.name}`,
          isPaid: sourceLeaveType.isPaid,
          carryForward: false,
          cycleType: 'calendar',
          defaultAccrual: null,
          isCarryForwardBucket: true,
          sourceLeaveTypeId: sourceLeaveType.id,
        },
        { transaction }
      );
    } catch (err) {
      if (err.name !== 'SequelizeUniqueConstraintError') throw err;
      // Race: created concurrently by another request.
      cfType = await db.LeaveType.findOne({
        where: { companyId, sourceLeaveTypeId: sourceLeaveType.id, isCarryForwardBucket: true },
        transaction,
      });
      if (!cfType) throw err;
    }
  }

  let cfPolicy = await db.LeavePolicy.findOne({ where: { companyId, leaveTypeId: cfType.id }, transaction });
  if (!cfPolicy) {
    cfPolicy = await db.LeavePolicy.create(
      { companyId, leaveTypeId: cfType.id, annualQuota: 0, accrual: 'yearly', applicableAfterDays: 0 },
      { transaction }
    );
  }

  if (targetRosterGroupId) {
    const existingLink = await db.RosterGroupLeavePolicy.findOne({
      where: { rosterGroupId: targetRosterGroupId, leaveTypeId: cfType.id },
      transaction,
    });
    if (!existingLink) {
      await db.RosterGroupLeavePolicy.create(
        { rosterGroupId: targetRosterGroupId, leaveTypeId: cfType.id, leavePolicyId: cfPolicy.id },
        { transaction }
      );
    }
  }

  return cfType;
}

// The actual "Change Roster" action, replacing the plain rosterGroupId field
// update — an employee's Roster governs which LeavePolicy applies per leave
// type (leaveBalance.service.js::resolveLeavePolicy), so switching Rosters
// can leave behind a real, unresolved leave balance if nothing decides what
// happens to it. carryForward (boolean, admin-chosen) decides:
//
//   false: every leave type the OLD Roster granted a balance for is reset to
//   whatever the NEW Roster's own policy would grant fresh (0 if the new
//   Roster doesn't map that type at all) — nothing carries over, matching
//   the explicit "sabkuch new roster ke according hoga" ask.
//
//   true: a leave type governed by BOTH old and new Roster needs no change
//   at all — leave_balances is keyed by (employee, leaveType, year), not by
//   Roster, so the existing row (and its remainder) already carries over for
//   free. A leave type the new Roster doesn't map gets its remainder (capped
//   at that leave type's own maxCarryForwardDays, same cap the normal
//   year-end carry-forward already respects) moved into a per-company
//   "Carry Forward - <name>" bucket type instead of silently vanishing.
async function changeEmployeeRoster({ companyId, id, newRosterGroupId, carryForward, actorUserId, scopedBrandIds, groupId }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds, groupId });
  const oldRosterGroupId = employee.rosterGroupId;
  const resolvedNewRosterGroupId = newRosterGroupId || null;

  if (String(oldRosterGroupId ?? '') === String(resolvedNewRosterGroupId ?? '')) {
    throw new HttpError(400, 'Employee is already assigned to this Roster');
  }
  await assertRosterGroupBelongsToCompany(resolvedNewRosterGroupId, employee.companyId);

  // rosterAssignedAt anchors the new Roster's own validity period (if any)
  // for this employee (see rosterValidity.js) — reset on every real
  // assignment change, including un-assigning to null. The notified-
  // threshold resets alongside it so the expiry-reminder job treats this as
  // a fresh cycle rather than skipping it as "already notified".
  const rosterAssignedAt = resolvedNewRosterGroupId ? dateOnly(toBusinessLocal()) : null;

  // First-ever assignment (no old Roster) — nothing to carry or reset.
  if (!oldRosterGroupId) {
    await employee.update({ rosterGroupId: resolvedNewRosterGroupId, rosterAssignedAt, rosterExpiryNotifiedThresholdDays: null });
    const log = await db.RosterTransferLog.create({
      companyId: employee.companyId,
      employeeId: employee.id,
      fromRosterGroupId: null,
      toRosterGroupId: resolvedNewRosterGroupId,
      carryForward: !!carryForward,
      actorUserId,
      details: [],
    });
    return { employee, details: [], rosterTransferLogId: log.id };
  }

  const currentYear = toBusinessLocal().getFullYear();
  const currentMonth = toBusinessLocal().getMonth() + 1;
  const dateStr = dateOnly(toBusinessLocal());

  const [oldMap, newMap] = await Promise.all([
    loadRosterLeaveTypeMap(oldRosterGroupId),
    loadRosterLeaveTypeMap(resolvedNewRosterGroupId),
  ]);

  const details = [];
  let rosterTransferLogId = null;

  await db.sequelize.transaction(async (t) => {
    for (const leaveTypeIdStr of oldMap.keys()) {
      const leaveTypeId = Number(leaveTypeIdStr);
      // monthly_reset types get their own row PER CALENDAR MONTH (see
      // leaveBalance.service.js::getOrCreateBalance) — the CURRENT month's
      // row, not the year's month:null row, is the one actually showing on
      // the employee's dashboard right now.
      const isMonthlyReset = oldMap.get(leaveTypeIdStr).accrual === 'monthly_reset';
      const balanceRow = await db.LeaveBalance.findOne({
        where: { employeeId: employee.id, leaveTypeId, year: currentYear, month: isMonthlyReset ? currentMonth : null },
        transaction: t,
      });
      const remainder = balanceRow ? Number(balanceRow.balance) : 0;
      if (!balanceRow || remainder <= 0) continue;

      const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId }, transaction: t });
      const matched = newMap.has(leaveTypeIdStr);

      if (!carryForward || (isMonthlyReset && !matched)) {
        // monthly_reset has no "remainder to carry" concept (use-it-or-
        // lose-it, per CLAUDE.md) — an unmatched monthly_reset type is
        // always reset to whatever the new Roster grants (0, since it's
        // unmatched by definition here), never routed into a Carry Forward
        // bucket, even when the admin chose "Yes" overall.
        const newPolicy = matched ? newMap.get(leaveTypeIdStr) : null;
        const cycle = resolveLeaveCycle({
          cycleType: leaveType.cycleType,
          dateOfJoining: employee.dateOfJoining,
          dateStr,
          customCycleStartMonth: leaveType.customCycleStartMonth,
          customCycleStartDay: leaveType.customCycleStartDay,
        });
        const freshAllotted = computeAllottedForPolicy({
          policy: newPolicy,
          cycleStart: cycle.cycleStart,
          cycleEnd: cycle.cycleEnd,
          dateOfJoining: employee.dateOfJoining,
          dateStr,
        });
        const used = Number(balanceRow.used);
        await balanceRow.update(
          { allotted: freshAllotted, balance: Math.round((freshAllotted - used) * 100) / 100 },
          { transaction: t }
        );
        details.push({
          leaveTypeId,
          leaveTypeName: leaveType.name,
          action: 'reset',
          previousBalance: remainder,
          newAllotted: freshAllotted,
          matchedInNewRoster: matched,
        });
        continue;
      }

      // carryForward === true
      if (matched) {
        // Same leave type is governed by the new Roster too — leave_balances
        // is keyed by (employee, leaveType, year), not by Roster, so this
        // row and its remainder already apply with zero changes needed.
        details.push({ leaveTypeId, leaveTypeName: leaveType.name, action: 'kept', balance: remainder });
        continue;
      }

      // New Roster doesn't govern this leave type at all — move the
      // (capped) remainder into a "Carry Forward - <name>" bucket rather
      // than letting it silently vanish.
      const cap = leaveType.maxCarryForwardDays;
      const carriedAmount = cap != null ? Math.min(remainder, Number(cap)) : remainder;

      if (carriedAmount > 0) {
        const cfType = await findOrCreateCarryForwardBucket({
          companyId: employee.companyId,
          sourceLeaveType: leaveType,
          targetRosterGroupId: resolvedNewRosterGroupId,
          transaction: t,
        });

        const cfBalance = await db.LeaveBalance.findOne({
          where: { employeeId: employee.id, leaveTypeId: cfType.id, year: currentYear, month: null },
          transaction: t,
        });
        if (cfBalance) {
          await cfBalance.update(
            {
              allotted: Math.round((Number(cfBalance.allotted) + carriedAmount) * 100) / 100,
              balance: Math.round((Number(cfBalance.balance) + carriedAmount) * 100) / 100,
            },
            { transaction: t }
          );
        } else {
          await db.LeaveBalance.create(
            {
              employeeId: employee.id,
              leaveTypeId: cfType.id,
              year: currentYear,
              month: null,
              allotted: carriedAmount,
              used: 0,
              balance: carriedAmount,
            },
            { transaction: t }
          );
        }

        details.push({
          leaveTypeId,
          leaveTypeName: leaveType.name,
          action: 'moved_to_carry_forward',
          carryForwardAmount: carriedAmount,
          carryForwardLeaveTypeId: cfType.id,
          carryForwardLeaveTypeName: cfType.name,
        });
      } else {
        details.push({
          leaveTypeId,
          leaveTypeName: leaveType.name,
          action: 'capped_to_zero',
          previousBalance: remainder,
        });
      }

      // Either way, the source row's own Roster no longer governs it — its
      // remainder has been relocated (or capped away), so it shouldn't keep
      // showing a phantom balance. `used` is left untouched (historical
      // fact of days actually taken under the old Roster).
      const used = Number(balanceRow.used);
      await balanceRow.update({ allotted: used, balance: 0 }, { transaction: t });
    }

    await employee.update(
      { rosterGroupId: resolvedNewRosterGroupId, rosterAssignedAt, rosterExpiryNotifiedThresholdDays: null },
      { transaction: t }
    );

    const log = await db.RosterTransferLog.create(
      {
        companyId: employee.companyId,
        employeeId: employee.id,
        fromRosterGroupId: oldRosterGroupId,
        toRosterGroupId: resolvedNewRosterGroupId,
        carryForward: !!carryForward,
        actorUserId,
        details,
      },
      { transaction: t }
    );
    rosterTransferLogId = log.id;
  });

  return { employee, details, rosterTransferLogId };
}

// Same Roster, no leave-balance decision involved at all — just pushes this
// employee's own validity window (rosterAssignedAt + the Roster's
// validityValue/validityUnit) forward from today. Distinct from
// changeEmployeeRoster, which rejects re-assigning the SAME Roster outright
// (there, "same roster" looks like a mistaken no-op click; here it's the
// explicit point of the action).
async function renewEmployeeRoster({ companyId, id, actorUserId, scopedBrandIds, groupId }) {
  const employee = await getEmployeeForWrite({ companyId, id, scopedBrandIds, groupId });
  if (!employee.rosterGroupId) throw new HttpError(400, 'Employee has no Roster assigned to renew');

  const rosterAssignedAt = dateOnly(toBusinessLocal());
  await employee.update({ rosterAssignedAt, rosterExpiryNotifiedThresholdDays: null });

  const log = await db.RosterTransferLog.create({
    companyId: employee.companyId,
    employeeId: employee.id,
    fromRosterGroupId: employee.rosterGroupId,
    toRosterGroupId: employee.rosterGroupId,
    // Not a real carry-forward decision (same Roster, nothing changes about
    // leave balances) — true is the closest fit for "nothing was reset".
    carryForward: true,
    actorUserId,
    details: [{ action: 'renewed', rosterGroupId: employee.rosterGroupId, rosterAssignedAt }],
  });

  return { employee, rosterTransferLogId: log.id };
}

async function listRosterTransferHistory({ companyId, id, scopedBrandIds, groupId }) {
  await getEmployeeForWrite({ companyId, id, scopedBrandIds, groupId });
  return db.RosterTransferLog.findAll({
    where: { employeeId: id },
    order: [['id', 'DESC']],
    include: [
      { model: db.User, as: 'actorUser', attributes: ['id', 'email'] },
      { model: db.RosterGroup, as: 'fromRosterGroup', attributes: ['id', 'name'] },
      { model: db.RosterGroup, as: 'toRosterGroup', attributes: ['id', 'name'] },
    ],
  });
}

module.exports = { changeEmployeeRoster, renewEmployeeRoster, listRosterTransferHistory };
