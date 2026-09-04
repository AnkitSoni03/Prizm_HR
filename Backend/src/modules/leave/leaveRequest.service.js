'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { isWorkingDay } = require('../../utils/workingDays');
const { datesBetween, addDays } = require('../../utils/dateRange');
const { getOrCreateBalance, resolveLeavePolicy } = require('./leaveBalance.service');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { notifyUser, notifyApprovers } = require('../../utils/notifications');
const { withEmployeePhoto } = require('../../utils/employeePhoto');
const { getManagersForEmployee } = require('../../utils/managerScope');

const MANAGER_APPROVAL_INCLUDE = {
  model: db.LeaveRequestApproval,
  as: 'managerApprovals',
  include: [{ model: db.Employee, as: 'manager', attributes: ['id', 'name', 'employeeCode', 'userId'] }],
};

async function listLeaveRequests({ companyId, brandId, employeeId, status, limit, offset }) {
  const where = {};
  // Array form is how a manager's "my team's requests" scope is expressed
  // (see leaveRequest.routes.js's requireReadAccess) — unlike brandId's
  // array handling below, an empty array here must still filter to zero
  // rows (a manager with no direct reports), not fall through to no filter.
  if (Array.isArray(employeeId)) {
    where.employeeId = { [Op.in]: employeeId };
  } else if (employeeId) {
    where.employeeId = employeeId;
  }
  if (status) where.status = status;

  const employeeWhere = { companyId };
  if (Array.isArray(brandId)) {
    if (brandId.length > 0) employeeWhere.brandId = { [Op.in]: brandId };
  } else if (brandId) {
    employeeWhere.brandId = brandId;
  }

  const { rows, count } = await db.LeaveRequest.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'DESC']],
    include: [
      { model: db.Employee, as: 'employee', where: employeeWhere, attributes: ['id', 'employeeCode', 'name', 'photoUrl'] },
      { model: db.LeaveType, as: 'leaveType' },
      {
        model: db.User,
        as: 'approverUser',
        attributes: ['id', 'email'],
        include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'name'] }],
      },
      // Per-manager decision breakdown — lets both the Team Approvals list
      // and the ESS "My Leave" list show, per request, exactly which
      // manager approved/rejected/is still pending, with zero extra round
      // trips. See leave_request_approvals' own header comment.
      MANAGER_APPROVAL_INCLUDE,
    ],
  });
  return { rows: await withEmployeePhoto(rows), count };
}

async function getLeaveRequestForDecision({ companyId, id }) {
  const request = await db.LeaveRequest.findOne({
    where: { id },
    include: [
      {
        model: db.Employee,
        as: 'employee',
        where: { companyId },
        attributes: ['id', 'brandId', 'managerId', 'userId', 'rosterGroupId'],
      },
      { model: db.LeaveType, as: 'leaveType' },
      MANAGER_APPROVAL_INCLUDE,
    ],
  });
  if (!request) throw new HttpError(404, 'Leave request not found');
  return request;
}

// PHASE4_MODELS.md's workflow notes, in order: compute working days, check
// balance (unless the leave type allows negative balance), check
// applicable_after_days eligibility, then create as 'pending'.
//
// Comp-off (leave_type.code === 'CO') is resolved by consuming a specific
// comp_off_credits row rather than leave_balances (see leave_requests
// migration comment) — since a single row can only link to one credit,
// comp-off requests are constrained to a single day here; taking multiple
// comp-off days means submitting multiple 1-day requests.
// `notify` defaults true for the normal employee-submits-a-request flow;
// attendance.service.js::bulkSetAttendanceStatus passes false for both this
// and approveLeaveRequest below (it creates-and-immediately-approves in one
// admin action, so a "pending request" notification to the manager would be
// stale/confusing by the time anyone saw it — the admin path sends its own
// single "who changed it" notification instead).
async function createLeaveRequest({ companyId, employeeId, leaveTypeId, fromDate, toDate, reason, notify = true }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId, companyId } });
  if (!leaveType) throw new HttpError(400, 'Leave type not found for this company');

  if (new Date(toDate) < new Date(fromDate)) {
    throw new HttpError(400, 'toDate cannot be before fromDate');
  }

  const isCompOff = leaveType.code === 'CO';
  if (isCompOff && fromDate !== toDate) {
    throw new HttpError(400, 'Comp-off requests must be a single day — submit one request per day');
  }

  const policy = await resolveLeavePolicy({ companyId, leaveTypeId, rosterGroupId: employee.rosterGroupId });
  if (policy && policy.applicableAfterDays > 0 && employee.dateOfJoining) {
    const eligibleFrom = addDays(employee.dateOfJoining, policy.applicableAfterDays);
    if (fromDate < eligibleFrom) {
      throw new HttpError(422, `Not eligible for this leave type until ${eligibleFrom}`);
    }
  }

  const candidateDates = datesBetween(fromDate, toDate);
  const workingFlags = await Promise.all(
    candidateDates.map((dateStr) =>
      isWorkingDay({ employeeId, companyId, brandId: employee.brandId, rosterGroupId: employee.rosterGroupId, dateStr })
    )
  );
  const days = workingFlags.filter(Boolean).length;
  if (days === 0) {
    throw new HttpError(422, 'No working days in the selected range');
  }

  const overlapping = await db.LeaveRequest.count({
    where: {
      employeeId,
      status: { [Op.in]: ['pending', 'approved'] },
      fromDate: { [Op.lte]: toDate },
      toDate: { [Op.gte]: fromDate },
    },
  });
  if (overlapping > 0) {
    throw new HttpError(409, 'An overlapping leave request already exists');
  }

  let compOffCreditId = null;
  if (isCompOff) {
    const credit = await db.CompOffCredit.findOne({
      // expiryDate: null means "earned under a carry-forward policy, never
      // expires" (see compOff.service.js) — still a valid credit to spend,
      // so it can't be excluded by a plain >= fromDate comparison.
      where: {
        employeeId,
        status: 'approved',
        [Op.or]: [{ expiryDate: null }, { expiryDate: { [Op.gte]: fromDate } }],
      },
      order: [['earnedDate', 'ASC']],
    });
    if (!credit) throw new HttpError(422, 'No available comp-off credit for this employee');
    compOffCreditId = credit.id;
  } else if (!leaveType.isPaid) {
    // LWP-style: no balance sufficiency check — negative balance allowed.
  } else {
    const balance = await getOrCreateBalance({ employeeId, leaveTypeId, dateStr: fromDate });
    if (Number(balance.balance) < days) {
      throw new HttpError(422, 'Insufficient leave balance');
    }
  }

  let request;
  try {
    request = await db.LeaveRequest.create({
      employeeId,
      leaveTypeId,
      fromDate,
      toDate,
      days,
      reason: reason || null,
      status: 'pending',
      compOffCreditId,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'That comp-off credit was just claimed by another request');
    }
    throw err;
  }

  // Snapshot the employee's CURRENT full manager set (primary + additional,
  // see managerScope.js::getManagersForEmployee) into one pending
  // leave_request_approvals row per manager — this is what the multi-manager
  // AND-gate approval workflow below actually decides against, and it stays
  // fixed even if the employee's managers change later (see the migration's
  // header comment for why that matters). Zero managers is a valid state
  // (nothing to snapshot) — the request then relies entirely on a
  // company/brand-wide admin to decide it, same as before this feature.
  const managers = await getManagersForEmployee({ companyId, employeeId });
  if (managers.length > 0) {
    await db.LeaveRequestApproval.bulkCreate(
      managers.map((manager) => ({
        companyId,
        leaveRequestId: request.id,
        managerEmployeeId: manager.id,
        status: 'pending',
      }))
    );
  }

  if (notify) {
    const employeeLabel = employee.name || employee.employeeCode;
    const managerCountNote = managers.length > 1 ? ` (needs all ${managers.length} of your managers)` : '';
    await Promise.all(
      managers.map((manager) =>
        notifyUser({
          companyId,
          userId: manager.userId,
          type: 'approval_pending',
          requestType: 'leave_request',
          requestId: request.id,
          title: `New leave request from ${employeeLabel}`,
          body: `${fromDate} → ${toDate}${managerCountNote}`,
        })
      )
    );
    await notifyApprovers({
      companyId,
      brandId: employee.brandId,
      code: 'leave_request:approve',
      excludeUserId: employee.userId,
      type: 'approval_pending',
      requestType: 'leave_request',
      requestId: request.id,
      title: `New leave request from ${employeeLabel}`,
      body: `${fromDate} → ${toDate}`,
    });
  }

  return request;
}

// Marks every still-'pending' per-manager row 'bypassed' (never silently
// left 'pending' — that would misleadingly suggest a decision is still
// outstanding once the whole request is already finalized — and never
// falsely flipped to 'approved'/'rejected', since that manager genuinely
// never decided). Shared by both admin-bypass paths below. Notifies each
// bypassed manager so a pending item in their queue doesn't sit there
// looking actionable after someone else already decided it for them.
async function bypassPendingManagerApprovals({ companyId, request, transaction }) {
  const stillPending = request.managerApprovals.filter((a) => a.status === 'pending');
  if (stillPending.length === 0) return [];

  await db.LeaveRequestApproval.update(
    { status: 'bypassed', decidedAt: new Date() },
    { where: { id: { [Op.in]: stillPending.map((a) => a.id) } }, transaction }
  );
  return stillPending;
}

// On approval: decrement leave_balances (or flip the linked comp-off credit
// to 'used'), then write attendance rows with status='leave' for the
// *working* days in the range only — a holiday/weekoff inside the range was
// never counted in `days` (see createLeaveRequest), so it must not be
// overwritten with a 'leave' status either. Mirrors
// od_request.service.js::approveOdRequest's findOrCreate-per-date pattern.
// Shared by both the admin-bypass path (approveLeaveRequest below) and the
// manager-consensus path (decideLeaveRequestAsManager, once its last
// pending manager approves) — decisionMode/actorEmployeeId/actorUserId
// differ, the actual balance/attendance side effects don't.
async function applyLeaveApprovalSideEffects({ companyId, request, actorEmployeeId, actorUserId, decisionMode, transaction: t }) {
  await request.update(
    { status: 'approved', approverId: actorEmployeeId || null, approverUserId: actorUserId, decisionMode },
    { transaction: t }
  );
  await recordApprovalDecision({
    companyId,
    requestType: 'leave_request',
    requestId: request.id,
    action: 'approved',
    actorUserId,
    actorEmployeeId: actorEmployeeId || null,
    transaction: t,
  });

  if (request.compOffCreditId) {
    const credit = await db.CompOffCredit.findOne({ where: { id: request.compOffCreditId }, transaction: t });
    if (!credit || credit.status !== 'approved') {
      throw new HttpError(409, 'Linked comp-off credit is no longer approved/available');
    }
    await credit.update({ status: 'used' }, { transaction: t });
  } else {
    // Usage is tracked in leave_balances even for unpaid (LWP-style)
    // types — only the insufficient-balance rejection at request-creation
    // time is skipped for those; approval still records the consumption,
    // which is allowed to push balance negative.
    const balance = await getOrCreateBalance({
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      dateStr: request.fromDate,
      transaction: t,
    });
    const used = Number(balance.used) + Number(request.days);
    await balance.update({ used, balance: Number(balance.allotted) - used }, { transaction: t });
  }

  for (const date of datesBetween(request.fromDate, request.toDate)) {
    const working = await isWorkingDay({
      employeeId: request.employeeId,
      companyId,
      brandId: request.employee.brandId,
      rosterGroupId: request.employee.rosterGroupId,
      dateStr: date,
    });
    if (!working) continue;

    const [attendance] = await db.Attendance.findOrCreate({
      where: { employeeId: request.employeeId, date },
      defaults: { employeeId: request.employeeId, date, status: 'leave' },
      transaction: t,
    });
    if (attendance.status !== 'leave') {
      await attendance.update({ status: 'leave' }, { transaction: t });
    }
  }
}

// ADMIN-BYPASS path only — reached when the caller holds the plain
// company/brand-wide leave_request:approve grant (see
// leaveRequest.routes.js's requireDecisionAccess). Finalizes immediately
// regardless of how many of the employee's managers have (or haven't)
// decided yet — that's the explicit "admin approval bypasses everyone"
// requirement. A manager's own individual decision goes through
// decideLeaveRequestAsManager below instead, which respects the AND-gate.
async function approveLeaveRequest({ companyId, id, approverId, approverUserId, notify = true }) {
  const request = await getLeaveRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'Leave request already decided');

  let bypassedManagers = [];
  await db.sequelize.transaction(async (t) => {
    await applyLeaveApprovalSideEffects({
      companyId,
      request,
      actorEmployeeId: approverId,
      actorUserId: approverUserId,
      decisionMode: 'admin_override',
      transaction: t,
    });
    bypassedManagers = await bypassPendingManagerApprovals({ companyId, request, transaction: t });
  });

  if (notify) {
    await notifyUser({
      companyId,
      userId: request.employee.userId,
      type: 'approval_decision',
      requestType: 'leave_request',
      requestId: request.id,
      title: 'Your leave request was approved',
      body: `${request.fromDate} → ${request.toDate} — approved directly by an admin.`,
    });
    await Promise.all(
      bypassedManagers.map((approval) =>
        notifyUser({
          companyId,
          userId: approval.manager?.userId,
          type: 'approval_decision',
          requestType: 'leave_request',
          requestId: request.id,
          title: 'A leave request you were reviewing was already decided',
          body: 'An admin approved it directly — no action needed from you.',
        })
      )
    );
  }

  return request;
}

// ADMIN-BYPASS path only — see approveLeaveRequest's header comment; the
// same bypass applies symmetrically to a reject.
async function rejectLeaveRequest({ companyId, id, approverId, approverUserId, reason }) {
  if (!reason || !reason.trim()) throw new HttpError(400, 'A reason is required to reject a leave request');

  const request = await getLeaveRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'Leave request already decided');

  let bypassedManagers = [];
  await db.sequelize.transaction(async (t) => {
    await request.update(
      {
        status: 'rejected',
        approverId: approverId || null,
        approverUserId,
        rejectionReason: reason.trim(),
        decisionMode: 'admin_override',
      },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'leave_request',
      requestId: request.id,
      action: 'rejected',
      actorUserId: approverUserId,
      actorEmployeeId: approverId || null,
      reason: reason.trim(),
      transaction: t,
    });
    bypassedManagers = await bypassPendingManagerApprovals({ companyId, request, transaction: t });
  });

  await notifyUser({
    companyId,
    userId: request.employee.userId,
    type: 'approval_decision',
    requestType: 'leave_request',
    requestId: request.id,
    title: 'Your leave request was rejected',
    body: reason.trim(),
  });
  await Promise.all(
    bypassedManagers.map((approval) =>
      notifyUser({
        companyId,
        userId: approval.manager?.userId,
        type: 'approval_decision',
        requestType: 'leave_request',
        requestId: request.id,
        title: 'A leave request you were reviewing was already decided',
        body: 'An admin rejected it directly — no action needed from you.',
      })
    )
  );

  return request;
}

// MANAGER-CONSENSUS path — reached only via the `_reports` permission
// variant (see requireDecisionAccess), i.e. the caller is genuinely one of
// this SPECIFIC request's snapshotted managers (leave_request_approvals),
// never a live/current re-check. A single manager's decision never finalizes
// the request by itself:
//   - 'rejected' finalizes the WHOLE request as rejected immediately (any
//     one manager saying no is enough — matches the "sabne approve kiya to
//     hi approve hoga" requirement's other half).
//   - 'approved' only finalizes once every OTHER manager has also approved;
//     until then the request stays 'pending' and the employee gets a
//     progress notification (N/total approved so far).
async function decideLeaveRequestAsManager({ companyId, id, managerEmployeeId, approverUserId, decision, reason }) {
  if (decision === 'rejected' && (!reason || !reason.trim())) {
    throw new HttpError(400, 'A reason is required to reject a leave request');
  }

  const request = await getLeaveRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'Leave request already decided');

  const myApproval = request.managerApprovals.find(
    (approval) => String(approval.managerEmployeeId) === String(managerEmployeeId)
  );
  if (!myApproval) {
    throw new HttpError(403, 'You are not one of the managers assigned to this request');
  }
  if (myApproval.status !== 'pending') {
    throw new HttpError(409, 'You already decided this request');
  }

  const manager = await db.Employee.findByPk(managerEmployeeId, { attributes: ['id', 'name', 'employeeCode'] });
  const managerLabel = manager?.name || manager?.employeeCode || 'A manager';

  let outcome; // 'rejected' | 'approved' | 'pending' (approved but not yet final)
  let approvedCount = 0;
  let totalManagers = request.managerApprovals.length;

  await db.sequelize.transaction(async (t) => {
    await myApproval.update(
      { status: decision, reason: decision === 'rejected' ? reason.trim() : null, decidedAt: new Date() },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'leave_request',
      requestId: request.id,
      action: decision,
      actorUserId: approverUserId,
      actorEmployeeId: managerEmployeeId,
      reason: decision === 'rejected' ? reason.trim() : undefined,
      transaction: t,
    });

    if (decision === 'rejected') {
      await request.update(
        {
          status: 'rejected',
          approverId: managerEmployeeId,
          approverUserId,
          rejectionReason: reason.trim(),
          decisionMode: 'manager_consensus',
        },
        { transaction: t }
      );
      outcome = 'rejected';
      return;
    }

    // Re-check inside the same transaction so the finalize decision is made
    // against the freshest possible view of every manager's row.
    const freshApprovals = await db.LeaveRequestApproval.findAll({
      where: { leaveRequestId: request.id },
      transaction: t,
    });
    totalManagers = freshApprovals.length;
    const stillPending = freshApprovals.filter((approval) => approval.status !== 'approved');
    approvedCount = freshApprovals.length - stillPending.length;

    if (stillPending.length === 0) {
      await applyLeaveApprovalSideEffects({
        companyId,
        request,
        actorEmployeeId: managerEmployeeId,
        actorUserId: approverUserId,
        decisionMode: 'manager_consensus',
        transaction: t,
      });
      outcome = 'approved';
    } else {
      outcome = 'pending';
    }
  });

  if (outcome === 'rejected') {
    await notifyUser({
      companyId,
      userId: request.employee.userId,
      type: 'approval_decision',
      requestType: 'leave_request',
      requestId: request.id,
      title: 'Your leave request was rejected',
      body: `${managerLabel}: ${reason.trim()}`,
    });
  } else if (outcome === 'approved') {
    await notifyUser({
      companyId,
      userId: request.employee.userId,
      type: 'approval_decision',
      requestType: 'leave_request',
      requestId: request.id,
      title: 'Your leave request was approved',
      body:
        totalManagers > 1
          ? `${request.fromDate} → ${request.toDate} — all ${totalManagers} of your managers approved it.`
          : `${request.fromDate} → ${request.toDate}`,
    });
  } else {
    await notifyUser({
      companyId,
      userId: request.employee.userId,
      type: 'approval_progress',
      requestType: 'leave_request',
      requestId: request.id,
      title: `${managerLabel} approved your leave request`,
      body: `${approvedCount}/${totalManagers} managers have approved — waiting on the rest.`,
    });
  }

  return request;
}

async function cancelLeaveRequest({ companyId, employeeId, id }) {
  const request = await db.LeaveRequest.findOne({ where: { id, employeeId } });
  if (!request) throw new HttpError(404, 'Leave request not found');
  if (request.status !== 'pending') throw new HttpError(409, 'Only a pending leave request can be cancelled');

  await request.update({ status: 'cancelled' });

  const employee = await db.Employee.findByPk(employeeId, {
    attributes: ['id', 'name', 'employeeCode', 'brandId', 'managerId', 'userId'],
  });
  const employeeLabel = employee?.name || employee?.employeeCode || 'An employee';
  const managers = await getManagersForEmployee({ companyId, employeeId });
  await Promise.all(
    managers.map((manager) =>
      notifyUser({
        companyId,
        userId: manager.userId,
        type: 'request_cancelled',
        requestType: 'leave_request',
        requestId: request.id,
        title: `${employeeLabel} cancelled their leave request`,
        body: `${request.fromDate} → ${request.toDate}`,
      })
    )
  );
  await notifyApprovers({
    companyId,
    brandId: employee?.brandId,
    code: 'leave_request:approve',
    excludeUserId: employee?.userId,
    type: 'request_cancelled',
    requestType: 'leave_request',
    requestId: request.id,
    title: `${employeeLabel} cancelled their leave request`,
    body: `${request.fromDate} → ${request.toDate}`,
  });

  return request;
}

module.exports = {
  listLeaveRequests,
  getLeaveRequestForDecision,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  decideLeaveRequestAsManager,
  cancelLeaveRequest,
};
