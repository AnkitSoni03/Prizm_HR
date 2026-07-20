'use strict';

const db = require('../models');

// Shared by leaveRequest/odRequest/attendanceRegularization/compOff services
// so every approve/reject decision across all four workflows lands in one
// queryable, immutable audit trail (CLAUDE.md rule 5: "Audit everything
// sensitive") — independent of the mutable status/approver columns on the
// request row itself.
async function recordApprovalDecision({
  companyId,
  requestType,
  requestId,
  action,
  actorUserId,
  actorEmployeeId,
  reason,
  transaction,
}) {
  return db.ApprovalHistory.create(
    {
      companyId,
      requestType,
      requestId,
      action,
      actorUserId,
      actorEmployeeId: actorEmployeeId || null,
      reason: reason || null,
    },
    { transaction }
  );
}

async function listApprovalHistory({ companyId, requestType, requestId }) {
  return db.ApprovalHistory.findAll({
    where: { companyId, requestType, requestId },
    order: [['id', 'ASC']],
    include: [
      {
        model: db.User,
        as: 'actorUser',
        attributes: ['id', 'email'],
        include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'name'] }],
      },
    ],
  });
}

module.exports = { recordApprovalDecision, listApprovalHistory };
