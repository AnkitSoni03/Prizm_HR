'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { employeeSearchWhere } = require('../../utils/employeeSearch');
const { checkAndCreateCompOffCredit } = require('../leave/compOff.service');
const { datesBetween } = require('../../utils/dateRange');
const { isHoliday, isWeeklyOff } = require('../../utils/workingDays');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { notifyUser, notifyApprovers } = require('../../utils/notifications');
const { withEmployeePhoto } = require('../../utils/employeePhoto');
const { getManagersForEmployee } = require('../../utils/managerScope');
const {
  snapshotManagerApprovals,
  bypassPendingManagerApprovals,
  castManagerVote,
  notifyManagers,
  MANAGER_INCLUDE,
} = require('../../utils/managerApprovals');

const MANAGER_APPROVAL_INCLUDE = { model: db.OdRequestApproval, as: 'managerApprovals', include: [MANAGER_INCLUDE] };

// companyId null is only ever passed for a manager's ?scope=reports list,
// where `employeeId` is already the exact (Group-bounded) set of their
// reports — possibly spread across several companies.
async function listOdRequests({ companyId, brandId, employeeId, status, search, limit, offset }) {
  const where = {};
  // Array form is a manager's "my team's requests" scope (see
  // odRequest.routes.js's requireReadAccess) — an empty array must still
  // filter to zero rows (a manager with no direct reports), unlike
  // brandId's array handling below.
  if (Array.isArray(employeeId)) {
    where.employeeId = { [Op.in]: employeeId };
  } else if (employeeId) {
    where.employeeId = employeeId;
  }
  if (status) where.status = status;

  const employeeWhere = { ...(companyId ? { companyId } : {}), ...employeeSearchWhere(search) };
  if (Array.isArray(brandId)) {
    if (brandId.length > 0) employeeWhere.brandId = { [Op.in]: brandId };
  } else if (brandId) {
    employeeWhere.brandId = brandId;
  }

  const { rows, count } = await db.OdRequest.findAndCountAll({
    distinct: true,
    where,
    limit,
    offset,
    order: [['id', 'DESC']],
    include: [
      {
        model: db.Employee,
        as: 'employee',
        where: employeeWhere,
        attributes: ['id', 'employeeCode', 'name', 'photoUrl', 'companyId', 'brandId'],
        include: [
          { model: db.Company, as: 'company', attributes: ['id', 'name'] },
          { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
        ],
      },
      {
        model: db.User,
        as: 'approverUser',
        attributes: ['id', 'email'],
        include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'name'] }],
      },
      MANAGER_APPROVAL_INCLUDE,
    ],
  });
  return { rows: await withEmployeePhoto(rows), count };
}

async function createOdRequest({ companyId, employeeId, fromDate, toDate, purpose, location }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (new Date(toDate) < new Date(fromDate)) {
    throw new HttpError(400, 'toDate cannot be before fromDate');
  }

  let managers = [];
  const request = await db.sequelize.transaction(async (t) => {
    const created = await db.OdRequest.create(
      { employeeId, fromDate, toDate, purpose, location, status: 'pending' },
      { transaction: t }
    );
    // Snapshot every manager (primary + additional, any company of the
    // Group) — all of them must approve (see utils/managerApprovals.js).
    managers = await snapshotManagerApprovals({
      ApprovalModel: db.OdRequestApproval,
      fkField: 'odRequestId',
      requestId: created.id,
      companyId,
      employeeId,
      transaction: t,
    });
    return created;
  });

  const employeeLabel = employee.name || employee.employeeCode;
  const managerCountNote = managers.length > 1 ? ` (needs all ${managers.length} managers)` : '';
  await notifyManagers(managers, {
    type: 'approval_pending',
    requestType: 'od_request',
    requestId: request.id,
    title: `New OD request from ${employeeLabel}`,
    body: `${fromDate} → ${toDate}${managerCountNote}`,
  });
  await notifyApprovers({
    companyId,
    brandId: employee.brandId,
    code: 'od_request:approve',
    excludeUserId: employee.userId,
    type: 'approval_pending',
    requestType: 'od_request',
    requestId: request.id,
    title: `New OD request from ${employeeLabel}`,
    body: `${fromDate} → ${toDate}`,
  });

  return request;
}

// companyId null looks the request up in ANY company — only for a
// cross-company manager, whose access is then proven against the request's
// own snapshotted managerApprovals by the caller (odRequest.routes.js).
async function getOdRequestForDecision({ companyId, id }) {
  const request = await db.OdRequest.findOne({
    where: { id },
    include: [
      {
        model: db.Employee,
        as: 'employee',
        where: companyId ? { companyId } : undefined,
        required: true,
        attributes: ['id', 'name', 'employeeCode', 'companyId', 'brandId', 'managerId', 'userId', 'rosterGroupId'],
      },
      MANAGER_APPROVAL_INCLUDE,
    ],
  });
  if (!request) throw new HttpError(404, 'OD request not found');
  return request;
}

// Approval marks attendance without a QR scan (PHASE3_MODELS.md) — one
// attendance row per day in the OD range, status 'on_duty', source 'od'.
// Shared by the admin path and the manager-consensus path (once the last
// manager approves). Returns the attendance rows written, for comp-off
// detection after commit.
async function applyOdApprovalSideEffects({ companyId, request, actorEmployeeId, actorUserId, decisionMode, transaction: t }) {
  const writtenAttendance = [];
  await request.update(
    { status: 'approved', approverId: actorEmployeeId || null, approverUserId: actorUserId, decisionMode },
    { transaction: t }
  );
  await recordApprovalDecision({
    companyId,
    requestType: 'od_request',
    requestId: request.id,
    action: 'approved',
    actorUserId,
    actorEmployeeId: actorEmployeeId || null,
    transaction: t,
  });

  for (const date of datesBetween(request.fromDate, request.toDate)) {
    const [attendance] = await db.Attendance.findOrCreate({
      where: { employeeId: request.employeeId, date },
      defaults: { employeeId: request.employeeId, date, status: 'on_duty', source: 'od' },
      transaction: t,
    });
    if (attendance.status !== 'on_duty') {
      await attendance.update({ status: 'on_duty', source: 'od' }, { transaction: t });
    }
    writtenAttendance.push({ attendanceId: attendance.id, dateStr: date });
  }
  return writtenAttendance;
}

// Comp-off detection runs after commit, same non-blocking-on-failure
// rationale as attendance.service.js's detectCompOffSafely.
async function detectCompOffForOd(request, writtenAttendance) {
  for (const { attendanceId, dateStr } of writtenAttendance) {
    try {
      await checkAndCreateCompOffCredit({ employeeId: request.employeeId, attendanceId, dateStr });
    } catch (err) {
      console.error('Comp-off auto-detection failed:', err);
    }
  }
}

async function notifyBypassedManagers(bypassed, request, verb) {
  await notifyManagers(
    bypassed.map((approval) => approval.manager).filter(Boolean),
    {
      type: 'approval_decision',
      requestType: 'od_request',
      requestId: request.id,
      title: 'An OD request you were reviewing was already decided',
      body: `An admin ${verb} it directly — no action needed from you.`,
    }
  );
}

// ADMIN path — company/brand-wide od_request:approve. Finalizes immediately,
// bypassing any manager who hasn't voted yet.
async function approveOdRequest({ companyId, id, approverId, approverUserId }) {
  const request = await getOdRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'OD request already decided');

  let writtenAttendance = [];
  let bypassed = [];
  await db.sequelize.transaction(async (t) => {
    writtenAttendance = await applyOdApprovalSideEffects({
      companyId,
      request,
      actorEmployeeId: approverId,
      actorUserId: approverUserId,
      decisionMode: 'admin_override',
      transaction: t,
    });
    bypassed = await bypassPendingManagerApprovals({
      ApprovalModel: db.OdRequestApproval,
      approvals: request.managerApprovals,
      transaction: t,
    });
  });

  await detectCompOffForOd(request, writtenAttendance);

  await notifyUser({
    companyId,
    userId: request.employee.userId,
    type: 'approval_decision',
    requestType: 'od_request',
    requestId: request.id,
    title: 'Your OD request was approved',
    body: `${request.fromDate} → ${request.toDate}`,
  });
  await notifyBypassedManagers(bypassed, request, 'approved');

  return request;
}

// ADMIN path — see approveOdRequest.
async function rejectOdRequest({ companyId, id, approverId, approverUserId, reason }) {
  if (!reason || !reason.trim()) throw new HttpError(400, 'A reason is required to reject an OD request');

  const request = await getOdRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'OD request already decided');

  let bypassed = [];
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
      requestType: 'od_request',
      requestId: request.id,
      action: 'rejected',
      actorUserId: approverUserId,
      actorEmployeeId: approverId || null,
      reason: reason.trim(),
      transaction: t,
    });
    bypassed = await bypassPendingManagerApprovals({
      ApprovalModel: db.OdRequestApproval,
      approvals: request.managerApprovals,
      transaction: t,
    });
  });

  await notifyUser({
    companyId,
    userId: request.employee.userId,
    type: 'approval_decision',
    requestType: 'od_request',
    requestId: request.id,
    title: 'Your OD request was rejected',
    body: reason.trim(),
  });
  await notifyBypassedManagers(bypassed, request, 'rejected');

  return request;
}

// MANAGER-CONSENSUS path — the caller is one of THIS request's snapshotted
// managers (checked in odRequest.routes.js and again here). One reject
// finalizes it as rejected; an approve finalizes only once every manager
// has approved. `companyId` is the REQUEST's company (the manager may sit in
// another company of the Group) and the controller runs this under that
// company's tenant context.
async function decideOdRequestAsManager({ companyId, id, managerEmployeeId, approverUserId, decision, reason }) {
  if (decision === 'rejected' && (!reason || !reason.trim())) {
    throw new HttpError(400, 'A reason is required to reject an OD request');
  }

  const request = await getOdRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'OD request already decided');

  const myApproval = request.managerApprovals.find(
    (approval) => String(approval.managerEmployeeId) === String(managerEmployeeId)
  );
  if (!myApproval) throw new HttpError(403, 'You are not one of the managers assigned to this request');
  if (myApproval.status !== 'pending') throw new HttpError(409, 'You already decided this request');

  const managerLabel = myApproval.manager?.name || myApproval.manager?.employeeCode || 'A manager';
  const trimmedReason = decision === 'rejected' ? reason.trim() : null;

  let vote;
  let writtenAttendance = [];
  await db.sequelize.transaction(async (t) => {
    vote = await castManagerVote({
      ApprovalModel: db.OdRequestApproval,
      fkField: 'odRequestId',
      requestId: request.id,
      myApproval,
      decision,
      reason: trimmedReason,
      transaction: t,
    });

    if (vote.outcome === 'approved') {
      // Last approval — applyOdApprovalSideEffects records the 'approved'
      // history row itself.
      writtenAttendance = await applyOdApprovalSideEffects({
        companyId,
        request,
        actorEmployeeId: managerEmployeeId,
        actorUserId: approverUserId,
        decisionMode: 'manager_consensus',
        transaction: t,
      });
      return;
    }

    await recordApprovalDecision({
      companyId,
      requestType: 'od_request',
      requestId: request.id,
      action: decision,
      actorUserId: approverUserId,
      actorEmployeeId: managerEmployeeId,
      reason: trimmedReason || undefined,
      transaction: t,
    });
    if (vote.outcome === 'rejected') {
      await request.update(
        {
          status: 'rejected',
          approverId: managerEmployeeId,
          approverUserId,
          rejectionReason: trimmedReason,
          decisionMode: 'manager_consensus',
        },
        { transaction: t }
      );
    }
  });

  if (vote.outcome === 'approved') await detectCompOffForOd(request, writtenAttendance);

  const userId = request.employee.userId;
  if (vote.outcome === 'rejected') {
    await notifyUser({
      companyId,
      userId,
      type: 'approval_decision',
      requestType: 'od_request',
      requestId: request.id,
      title: 'Your OD request was rejected',
      body: `${managerLabel}: ${trimmedReason}`,
    });
  } else if (vote.outcome === 'approved') {
    await notifyUser({
      companyId,
      userId,
      type: 'approval_decision',
      requestType: 'od_request',
      requestId: request.id,
      title: 'Your OD request was approved',
      body:
        vote.total > 1
          ? `${request.fromDate} → ${request.toDate} — all ${vote.total} of your managers approved it.`
          : `${request.fromDate} → ${request.toDate}`,
    });
  } else {
    await notifyUser({
      companyId,
      userId,
      type: 'approval_progress',
      requestType: 'od_request',
      requestId: request.id,
      title: `${managerLabel} approved your OD request`,
      body: `${vote.approvedCount}/${vote.total} managers have approved — waiting on the rest.`,
    });
  }

  return request;
}

// ADMIN-only (requireDecisionAccess('approve', { adminOnly: true })): reverts
// an already-approved OD request, whoever approved it, undoing what
// applyOdApprovalSideEffects (and the comp-off detection after it) did.
// Each 'on_duty'/'od' attendance row in the range goes back to what that day
// looks like with no OD: 'present' if they actually punched in (the punch
// stays), else 'holiday' / 'weekoff' / 'absent' — the same status the
// attendance board derives for a day with no row. Rows are updated, not
// deleted (non-partial unique (employee_id, date) index, see
// leaveRequest.service.js::revokeLeaveRequest). A comp-off credit earned from
// a reverted (non-punched) day is rejected with the revert reason; if one
// was already spent on a leave the revert is refused — revert that leave
// first. Also refused once a processed/paid payroll run covers the dates.
async function revokeOdRequest({ companyId, id, actorEmployeeId, actorUserId, reason }) {
  if (!reason || !reason.trim()) throw new HttpError(400, 'A reason is required to revert an OD request');

  const request = await getOdRequestForDecision({ companyId, id });
  if (request.status !== 'approved') throw new HttpError(409, 'Only an approved OD request can be reverted');

  const lockedRun = await db.PayrollRun.findOne({
    where: {
      companyId: request.employee.companyId,
      status: { [Op.in]: ['processed', 'paid'] },
      payPeriodStart: { [Op.lte]: request.toDate },
      payPeriodEnd: { [Op.gte]: request.fromDate },
    },
    attributes: ['id', 'periodMonth', 'periodYear'],
  });
  if (lockedRun) {
    throw new HttpError(
      409,
      `Payroll for ${lockedRun.periodMonth}/${lockedRun.periodYear} is already processed for these dates — this OD can no longer be reverted`
    );
  }

  const rows = await db.Attendance.findAll({
    where: {
      employeeId: request.employeeId,
      date: { [Op.between]: [request.fromDate, request.toDate] },
      status: 'on_duty',
      source: 'od',
    },
  });
  const unworkedRows = rows.filter((row) => !row.checkIn);
  const credits = unworkedRows.length
    ? await db.CompOffCredit.findAll({
        where: { sourceAttendanceId: { [Op.in]: unworkedRows.map((row) => row.id) } },
      })
    : [];
  if (credits.some((credit) => credit.status === 'used')) {
    throw new HttpError(
      409,
      'A comp-off earned from this OD has already been used for leave — revert that leave first'
    );
  }

  // Resolved before the transaction — isWeeklyOff reads shifts/rosters
  // outside it anyway.
  const restoredStatus = new Map();
  for (const row of unworkedRows) {
    const holiday = await isHoliday({
      companyId: request.employee.companyId,
      brandId: request.employee.brandId,
      rosterGroupId: request.employee.rosterGroupId,
      dateStr: row.date,
    });
    const weeklyOff = holiday ? false : await isWeeklyOff({ employeeId: request.employeeId, dateStr: row.date });
    restoredStatus.set(row.id, holiday ? 'holiday' : weeklyOff ? 'weekoff' : 'absent');
  }

  await db.sequelize.transaction(async (t) => {
    for (const row of rows) {
      if (row.checkIn) {
        await row.update({ status: 'present' }, { transaction: t });
      } else {
        await row.update({ status: restoredStatus.get(row.id), source: null }, { transaction: t });
      }
    }
    for (const credit of credits) {
      if (credit.status === 'rejected' || credit.status === 'expired') continue;
      await credit.update(
        { status: 'rejected', rejectionReason: `OD reverted: ${reason.trim()}` },
        { transaction: t }
      );
    }

    await request.update(
      { status: 'revoked', revokedAt: new Date(), revokedByUserId: actorUserId, revokeReason: reason.trim() },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'od_request',
      requestId: request.id,
      action: 'revoked',
      actorUserId,
      actorEmployeeId: actorEmployeeId || null,
      reason: reason.trim(),
      transaction: t,
    });
  });

  await notifyUser({
    companyId,
    userId: request.employee.userId,
    type: 'approval_decision',
    requestType: 'od_request',
    requestId: request.id,
    title: 'Your approved OD was reverted',
    body: `${request.fromDate} → ${request.toDate}: ${reason.trim()}`,
  });

  return request;
}

async function cancelOdRequest({ companyId, employeeId, id }) {
  const request = await db.OdRequest.findOne({ where: { id, employeeId } });
  if (!request) throw new HttpError(404, 'OD request not found');
  if (request.status !== 'pending') throw new HttpError(409, 'Only a pending OD request can be cancelled');

  await request.update({ status: 'cancelled' });

  const employee = await db.Employee.findByPk(employeeId, {
    attributes: ['id', 'name', 'employeeCode', 'brandId', 'managerId', 'userId'],
  });
  const employeeLabel = employee?.name || employee?.employeeCode || 'An employee';
  const managers = await getManagersForEmployee({ companyId, employeeId });
  await notifyManagers(managers, {
    type: 'request_cancelled',
    requestType: 'od_request',
    requestId: request.id,
    title: `${employeeLabel} cancelled their OD request`,
    body: `${request.fromDate} → ${request.toDate}`,
  });
  await notifyApprovers({
    companyId,
    brandId: employee?.brandId,
    code: 'od_request:approve',
    excludeUserId: employee?.userId,
    type: 'request_cancelled',
    requestType: 'od_request',
    requestId: request.id,
    title: `${employeeLabel} cancelled their OD request`,
    body: `${request.fromDate} → ${request.toDate}`,
  });

  return request;
}

module.exports = {
  listOdRequests,
  getOdRequestForDecision,
  createOdRequest,
  approveOdRequest,
  rejectOdRequest,
  decideOdRequestAsManager,
  revokeOdRequest,
  cancelOdRequest,
};
