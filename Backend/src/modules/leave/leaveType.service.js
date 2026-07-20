'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function listLeaveTypes({ limit, offset }) {
  // Relies on LeaveType's tenant-scope hook for company_id filtering.
  const { rows, count } = await db.LeaveType.findAndCountAll({
    limit,
    offset,
    order: [['id', 'ASC']],
  });
  return { rows, count };
}

async function getLeaveTypeForRead(id) {
  const leaveType = await db.LeaveType.findOne({ where: { id } });
  if (!leaveType) throw new HttpError(404, 'Leave type not found');
  return leaveType;
}

async function getLeaveTypeForWrite({ companyId, id }) {
  const leaveType = await db.LeaveType.findOne({ where: { id, companyId } });
  if (!leaveType) throw new HttpError(404, 'Leave type not found');
  return leaveType;
}

async function createLeaveType({ companyId, code, name, isPaid, carryForward }) {
  try {
    return await db.LeaveType.create({
      companyId,
      code,
      name,
      isPaid: isPaid !== undefined ? !!isPaid : true,
      carryForward: !!carryForward,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'code already in use for this company');
    }
    throw err;
  }
}

async function updateLeaveType({ companyId, id, updates }) {
  const leaveType = await getLeaveTypeForWrite({ companyId, id });
  const { name, isPaid, carryForward } = updates;

  await leaveType.update({
    ...(name !== undefined && { name }),
    ...(isPaid !== undefined && { isPaid }),
    ...(carryForward !== undefined && { carryForward }),
  });
  return leaveType;
}

module.exports = { listLeaveTypes, getLeaveTypeForRead, getLeaveTypeForWrite, createLeaveType, updateLeaveType };
