'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { getManagersForEmployee } = require('./managerScope');
const { notifyUser } = require('./notifications');

// Shared multi-manager AND-gate for OD requests and comp-off credits — the
// same rules leaveRequest.service.js already applies to leave (kept there
// as-is): every snapshotted manager must approve; any one reject finalizes
// it as rejected; an admin decision bypasses whoever hasn't voted yet.
// `ApprovalModel` is OdRequestApproval / CompOffCreditApproval and `fkField`
// its parent-id attribute (odRequestId / compOffCreditId).

// Snapshots the employee's CURRENT full manager set (primary + additional,
// any company of the Group) as one pending row per manager. Zero managers is
// valid — the item then waits on a company/brand-wide admin, as before.
async function snapshotManagerApprovals({ ApprovalModel, fkField, requestId, companyId, employeeId, transaction }) {
  const managers = await getManagersForEmployee({ companyId, employeeId });
  if (managers.length > 0) {
    await ApprovalModel.bulkCreate(
      managers.map((manager) => ({
        companyId,
        [fkField]: requestId,
        managerEmployeeId: manager.id,
        status: 'pending',
      })),
      { transaction }
    );
  }
  return managers;
}

// Admin decided directly: flip every still-pending row to 'bypassed' (never
// left looking actionable, never falsely 'approved'). Returns those rows.
async function bypassPendingManagerApprovals({ ApprovalModel, approvals, transaction }) {
  const stillPending = (approvals || []).filter((a) => a.status === 'pending');
  if (stillPending.length === 0) return [];
  await ApprovalModel.update(
    { status: 'bypassed', decidedAt: new Date() },
    { where: { id: { [Op.in]: stillPending.map((a) => a.id) } }, transaction }
  );
  return stillPending;
}

// Records one manager's vote. Returns { outcome, approvedCount, total }:
// outcome 'rejected' (finalize as rejected), 'approved' (every manager has
// now approved — finalize), or 'pending' (approved, others still to vote).
// The caller does the actual finalize inside the same transaction.
async function castManagerVote({ ApprovalModel, fkField, requestId, myApproval, decision, reason, transaction }) {
  await myApproval.update(
    { status: decision, reason: decision === 'rejected' ? reason : null, decidedAt: new Date() },
    { transaction }
  );
  if (decision === 'rejected') return { outcome: 'rejected', approvedCount: 0, total: 0 };

  const fresh = await ApprovalModel.findAll({ where: { [fkField]: requestId }, transaction });
  const approvedCount = fresh.filter((a) => a.status === 'approved').length;
  return {
    outcome: approvedCount === fresh.length ? 'approved' : 'pending',
    approvedCount,
    total: fresh.length,
  };
}

// Notifies managers in THEIR OWN company — a cross-company manager reads
// notifications under their own tenant, so the row must carry it.
async function notifyManagers(managers, { type, requestType, requestId, title, body }) {
  await Promise.all(
    (managers || []).map((manager) =>
      notifyUser({
        companyId: manager.companyId,
        userId: manager.userId,
        type,
        requestType,
        requestId,
        title,
        body,
      })
    )
  );
}

// Brings every STILL-PENDING leave/OD/comp-off item of one employee in line
// with their CURRENT managers — called whenever an admin saves the
// employee's managers. Without it, a request submitted before a manager was
// assigned (or by older code that snapshotted nobody) has no row for that
// manager, so they'd see it in Team Approvals with no buttons. Adds a
// pending row for each missing manager; drops a removed manager's pending
// row only while someone else is still left to vote, so an item can never
// slip into "approved" just because a manager was removed. Votes already
// cast are never touched.
async function syncPendingManagerApprovals({ companyId, employeeId }) {
  const managers = await getManagersForEmployee({ companyId, employeeId });
  const currentIds = new Set(managers.map((m) => String(m.id)));

  const kinds = [
    { Parent: db.LeaveRequest, Approval: db.LeaveRequestApproval, fkField: 'leaveRequestId', pending: 'pending' },
    { Parent: db.OdRequest, Approval: db.OdRequestApproval, fkField: 'odRequestId', pending: 'pending' },
    { Parent: db.CompOffCredit, Approval: db.CompOffCreditApproval, fkField: 'compOffCreditId', pending: 'pending_approval' },
  ];

  await db.sequelize.transaction(async (t) => {
    for (const { Parent, Approval, fkField, pending } of kinds) {
      const items = await Parent.findAll({
        where: { employeeId, status: pending },
        attributes: ['id'],
        include: [{ model: Approval, as: 'managerApprovals' }],
        transaction: t,
      });
      for (const item of items) {
        const rows = item.managerApprovals || [];
        const existingIds = new Set(rows.map((row) => String(row.managerEmployeeId)));
        const toAdd = managers.filter((m) => !existingIds.has(String(m.id)));
        if (toAdd.length > 0) {
          await Approval.bulkCreate(
            toAdd.map((m) => ({ companyId, [fkField]: item.id, managerEmployeeId: m.id, status: 'pending' })),
            { transaction: t }
          );
        }

        const stalePending = rows.filter((row) => row.status === 'pending' && !currentIds.has(String(row.managerEmployeeId)));
        const pendingLeft = rows.filter((row) => row.status === 'pending').length - stalePending.length + toAdd.length;
        if (stalePending.length > 0 && pendingLeft > 0) {
          // Hard delete — the (item, manager) unique index ignores only
          // soft-deleted rows, and a later re-add must be able to reuse it.
          await Approval.destroy({
            where: { id: { [Op.in]: stalePending.map((row) => row.id) } },
            force: true,
            transaction: t,
          });
        }
      }
    }
  });
}

// Loads `manager` (id/name/code/userId/companyId) for already-loaded
// approval rows without a tenant-scoped include surprise — included rows
// skip the tenant hook, so a plain include is safe here.
const MANAGER_INCLUDE = { model: db.Employee, as: 'manager', attributes: ['id', 'name', 'employeeCode', 'userId', 'companyId'] };

module.exports = {
  snapshotManagerApprovals,
  bypassPendingManagerApprovals,
  castManagerVote,
  notifyManagers,
  syncPendingManagerApprovals,
  MANAGER_INCLUDE,
};
