'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

// Group has no tenant-scope hook (it sits above the Company tenant
// boundary), so listing is scoped manually: Super Admin (companyId and
// groupId both null) sees every Group; a Group Admin only sees their own.
async function listGroups({ callerGroupId, limit, offset }) {
  const where = callerGroupId !== null ? { id: callerGroupId } : {};

  const { rows, count } = await db.Group.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
  });
  return { rows, count };
}

async function createGroup({ name, status, planId, createdBy }) {
  return db.Group.create({
    name,
    status,
    planId: planId ?? null,
    createdBy,
  });
}

// Delete is Super-Admin-only (CLAUDE.md: "Only Super Admin creates Groups,
// Companies, Brands"), same as createGroup — no callerGroupId scoping needed
// since a Group Admin never holds group:delete.
async function updateGroup({ id, updates }) {
  const group = await db.Group.findByPk(id);
  if (!group) throw new HttpError(404, 'Group not found');

  const { name, status, planId } = updates;
  await group.update({
    ...(name !== undefined && { name }),
    ...(status !== undefined && { status }),
    ...(planId !== undefined && { planId: planId ?? null }),
  });
  return group;
}

// Surfaces the Group Admin invite created by inviteGroupAdmin (if any), so
// the Super Admin edit UI can show "already invited" instead of re-showing
// a blank invite form after a "Skip for now". groupId on Invitation is only
// ever set by inviteGroupAdmin, so no roleId filter is needed the way
// company/brand admin-invitation lookups need one to exclude ESS/Brand
// Admin invites sharing the same companyId.
async function getGroupAdminInvitation(groupId) {
  const invitation = await db.Invitation.findOne({
    where: { groupId },
    order: [['createdAt', 'DESC']],
  });
  if (!invitation) return null;

  const user = await db.User.findOne({ where: { groupId, email: invitation.email } });
  return { email: invitation.email, status: user ? user.status : 'invited' };
}

async function deleteGroup({ id }) {
  const group = await db.Group.findByPk(id);
  if (!group) throw new HttpError(404, 'Group not found');

  // Company has no tenant-scope hook and paranoid:true excludes soft-deleted
  // rows automatically, so this count is already "active (non-deleted)
  // companies only" — same delete-guard shape as brand.service.js's
  // employee count.
  const activeCompanyCount = await db.Company.count({ where: { groupId: id } });
  if (activeCompanyCount > 0) {
    throw new HttpError(409, `Cannot delete group: ${activeCompanyCount} compan${activeCompanyCount === 1 ? 'y' : 'ies'} still active`);
  }

  await group.destroy();
}

module.exports = { listGroups, createGroup, updateGroup, getGroupAdminInvitation, deleteGroup };
