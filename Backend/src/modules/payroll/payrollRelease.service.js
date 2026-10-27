'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const sseHub = require('../../utils/sseHub');
const { HttpError } = require('../../utils/errors');
const { sendMail } = require('../../utils/mailer');
const { runAsCompany } = require('../../config/tenant-context');
const {
  scopedEmployeeWhere,
  canEditOwner,
  salaryOwner,
  ownerLevelOf,
  callerOwnerFor,
  accessForLevel,
  canChangeSalary,
  ownerManagerRecipients,
  groupCompanyIds,
} = require('./payrollAccess');

// ---------------------------------------------------------------------------
// Salary release: an employee's salary belongs to the level that assigned it
// (salary_assignments.owner_company_id / owner_brand_id). A lower level that
// wants to put the employee on its own template asks the owner to release
// them; the owner (or anyone above it) approves or rejects. Approving HANDS
// THE CURRENT SALARY OVER — its owner moves to the requester's level and it
// keeps running unchanged, so there is never a month without a salary; the
// requester then assigns their own template as a normal revision.
// An owner can also release employees directly, without a request.
// ---------------------------------------------------------------------------

const asGroup = (fn) => runAsCompany(null, fn);
const MAX_BATCH = 500;
const LEVEL_NAMES = { group: 'Group', company: 'Company', brand: 'Brand' };

const EMPLOYEE_ATTRS = ['id', 'name', 'employeeCode', 'companyId', 'brandId', 'userId'];

function idList(raw) {
  const ids = [...new Set((Array.isArray(raw) ? raw : []).map((v) => String(v)).filter(Boolean))];
  if (ids.length === 0) throw new HttpError(400, 'Choose at least one employee');
  if (ids.length > MAX_BATCH) throw new HttpError(400, `Choose at most ${MAX_BATCH} employees at a time`);
  return ids;
}

async function activeSalaries(employeeIds) {
  const rows = await db.SalaryAssignment.findAll({ where: { employeeId: { [Op.in]: employeeIds }, status: 'active' } });
  return new Map(rows.map((a) => [String(a.employeeId), a]));
}

const sameOwner = (a, b) => String(a.companyId ?? '') === String(b.companyId ?? '') && String(a.brandId ?? '') === String(b.brandId ?? '');

// ---- Notifications (dashboard + email), best-effort -------------------------

// A Group Admin has no company of their own; their notification row is filed
// under `fallbackCompanyId` (a company of the Group — they read notifications
// without a tenant filter, so any of them works).
async function deliver(recipients, { type, title, body, fallbackCompanyId }) {
  try {
    const unique = new Map();
    for (const r of recipients) if (r.userId && !unique.has(String(r.userId))) unique.set(String(r.userId), r);
    if (unique.size === 0) return;
    const users = await asGroup(() =>
      db.User.findAll({ where: { id: { [Op.in]: [...unique.keys()] } }, attributes: ['id', 'email', 'companyId', 'isActive'] })
    );
    await Promise.all(
      users.map(async (user) => {
        const companyId = unique.get(String(user.id)).companyId || user.companyId || fallbackCompanyId;
        if (companyId) {
          try {
            const n = await asGroup(() =>
              db.Notification.create({ companyId, userId: user.id, type, requestType: 'payroll', title, body: body || null })
            );
            sseHub.sendToUser(user.id, n.toJSON());
          } catch (err) {
            console.error('Failed to create payroll release notification:', err);
          }
        }
        if (user.email && user.isActive !== false) {
          sendMail({
            to: user.email,
            subject: title,
            text: `${title}\n\n${body || ''}\n\nOpen Payroll → Release Requests in HRMS to see it.`,
            html: `<p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(body || '')}</p><p>Open <strong>Payroll → Release Requests</strong> in HRMS to see it.</p>`,
          }).catch((err) => console.error('Failed to send payroll release email:', err.message || err));
        }
      })
    );
  } catch (err) {
    console.error('Failed to deliver payroll release notifications:', err);
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---- Request (lower level) -------------------------------------------------

// body: { employeeIds[], reason? }. Only employees in the caller's scope whose
// current salary is owned above the caller; one open request per employee.
async function requestRelease(access, { body, userId }) {
  if (access.level === 'group') throw new HttpError(400, 'The Group can change any salary — no release is needed');
  const ids = idList(body.employeeIds);
  const reason = body.reason ? String(body.reason).trim().slice(0, 1000) || null : null;

  const { created, skipped } = await asGroup(async () => {
    const employees = await db.Employee.findAll({
      where: { ...(await scopedEmployeeWhere(access)), id: { [Op.in]: ids } },
      attributes: EMPLOYEE_ATTRS,
    });
    const byId = new Map(employees.map((e) => [String(e.id), e]));
    const salaries = await activeSalaries(ids);
    const createdRows = [];
    const skippedRows = [];
    for (const id of ids) {
      const employee = byId.get(id);
      const skip = (why) => skippedRows.push({ employeeId: id, name: employee ? employee.name : null, reason: why });
      if (!employee) {
        skip('Not in your payroll scope');
        continue;
      }
      const active = salaries.get(id);
      if (canChangeSalary(access, active)) {
        skip('Already yours to assign — no release needed');
        continue;
      }
      const target = callerOwnerFor(access, employee);
      const owner = salaryOwner(active);
      // eslint-disable-next-line no-await-in-loop
      const open = await db.PayrollReleaseRequest.findOne({
        where: { employeeId: id, status: 'pending', toCompanyId: target.companyId, toBrandId: target.brandId },
      });
      if (open) {
        skip('A release is already requested');
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const row = await db.PayrollReleaseRequest.create({
        groupId: access.groupId,
        companyId: employee.companyId,
        employeeId: employee.id,
        assignmentId: active.id,
        ownerCompanyId: owner.companyId,
        ownerBrandId: owner.brandId,
        toCompanyId: target.companyId,
        toBrandId: target.brandId,
        reason,
        status: 'pending',
        requestedByUserId: userId,
      });
      createdRows.push({ row, owner });
    }
    return { created: createdRows, skipped: skippedRows };
  });

  // One notification per owner level, naming how many employees.
  const byOwner = new Map();
  for (const { row, owner } of created) {
    const key = `${owner.companyId || ''}|${owner.brandId || ''}|${row.toBrandId || ''}`;
    if (!byOwner.has(key)) byOwner.set(key, { owner, row, count: 0 });
    byOwner.get(key).count += 1;
  }
  if (byOwner.size > 0) {
    setImmediate(async () => {
      for (const { owner, row, count } of byOwner.values()) {
        // eslint-disable-next-line no-await-in-loop
        const requester = await levelName(access.groupId, { companyId: row.toCompanyId, brandId: row.toBrandId });
        // eslint-disable-next-line no-await-in-loop
        const recipients = await ownerManagerRecipients(access.groupId, owner);
        // eslint-disable-next-line no-await-in-loop
        await deliver(recipients.filter((r) => String(r.userId) !== String(userId)), {
          type: 'payroll_release_requested',
          title: `Salary release requested for ${plural(count, 'employee')}`,
          body: `${requester} wants to manage the salary of ${plural(count, 'employee')} you assigned.${reason ? ` Reason: ${reason}` : ''}`,
          fallbackCompanyId: row.toCompanyId,
        });
      }
    });
  }
  return { created: created.map((c) => c.row), skipped };
}

// The requester cancels their own pending requests.
async function cancelRelease(access, { body, userId }) {
  const ids = idList(body.ids);
  return asGroup(async () => {
    const rows = await db.PayrollReleaseRequest.findAll({ where: { ...outgoingWhere(access), id: { [Op.in]: ids }, status: 'pending' } });
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      await row.update({ status: 'cancelled', decidedByUserId: userId, decidedAt: new Date() });
    }
    return { cancelled: rows.length };
  });
}

// ---- Lists ------------------------------------------------------------------

// Requests the caller can decide: their own level owns the salary, or a
// level below theirs does.
function incomingWhere(access) {
  if (access.level === 'group') return { groupId: access.groupId };
  if (!access.scopedBrandIds) return { groupId: access.groupId, ownerCompanyId: access.companyId };
  return { groupId: access.groupId, ownerCompanyId: access.companyId, ownerBrandId: { [Op.in]: access.scopedBrandIds } };
}

// Requests the caller's own level made.
function outgoingWhere(access) {
  if (access.level === 'group') return { id: -1 };
  return {
    groupId: access.groupId,
    toCompanyId: access.companyId,
    toBrandId: access.scopedBrandIds ? { [Op.in]: access.scopedBrandIds } : null,
  };
}

async function listReleaseRequests(access, { direction = 'incoming', status = 'pending', limit = 50, offset = 0 }) {
  return asGroup(async () => {
    const where = direction === 'outgoing' ? outgoingWhere(access) : incomingWhere(access);
    if (status && status !== 'all') where.status = status;
    const { rows, count } = await db.PayrollReleaseRequest.findAndCountAll({
      where,
      include: [
        {
          model: db.Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode', 'companyId', 'brandId'],
          include: [
            { model: db.Company, as: 'company', attributes: ['id', 'name'] },
            { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
          ],
        },
        {
          model: db.SalaryAssignment,
          as: 'assignment',
          attributes: ['id', 'monthlyGross', 'effectiveFrom', 'templateId'],
          include: [{ model: db.PayrollTemplate, as: 'template', attributes: ['id', 'name'], paranoid: false }],
        },
        { model: db.Company, as: 'toCompany', attributes: ['id', 'name'] },
        { model: db.Brand, as: 'toBrand', attributes: ['id', 'name'] },
        { model: db.User, as: 'requestedBy', attributes: ['id', 'email'] },
        { model: db.User, as: 'decidedBy', attributes: ['id', 'email'] },
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
    return {
      rows: rows.map((r) => {
        const owner = { companyId: r.ownerCompanyId, brandId: r.ownerBrandId };
        return {
          ...r.get({ plain: true }),
          ownerLevel: ownerLevelOf(owner),
          toLevel: r.toBrandId ? 'brand' : 'company',
          canDecide: direction !== 'outgoing' && r.status === 'pending' && canEditOwner(access, owner),
        };
      }),
      count,
    };
  });
}

async function pendingIncomingCount(access) {
  if (!access.canManage) return 0;
  return asGroup(() => db.PayrollReleaseRequest.count({ where: { ...incomingWhere(access), status: 'pending' } }));
}

// ---- Decide (owner level or above) -----------------------------------------

// body: { ids[], approve: boolean, note? } — a reason is needed to reject.
async function decideRelease(access, { body, userId }) {
  const ids = idList(body.ids);
  const approve = body.approve === true;
  const note = body.note ? String(body.note).trim().slice(0, 1000) || null : null;
  if (!approve && !note) throw new HttpError(400, 'Give a reason for rejecting');

  const decided = await asGroup(async () => {
    const rows = await db.PayrollReleaseRequest.findAll({
      where: { ...incomingWhere(access), id: { [Op.in]: ids }, status: 'pending' },
      include: [{ model: db.Employee, as: 'employee', attributes: EMPLOYEE_ATTRS }],
    });
    const out = [];
    for (const row of rows) {
      if (!canEditOwner(access, { companyId: row.ownerCompanyId, brandId: row.ownerBrandId })) continue;
      if (approve) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await handOver(access, row.employeeId, { companyId: row.toCompanyId, brandId: row.toBrandId }, userId);
        if (!ok) continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await row.update({ status: approve ? 'approved' : 'rejected', decidedByUserId: userId, decidedAt: new Date(), decisionNote: note });
      out.push(row);
    }
    return out;
  });

  setImmediate(() => notifyRequesters(decided, approve, note));
  return { decided: decided.length };
}

// Moves the employee's current salary down to `target`. Nothing to move when
// there is no current salary or the target can already change it; false
// (request left pending) when the salary has since gone above the caller.
async function handOver(access, employeeId, target, userId) {
  const active = await db.SalaryAssignment.findOne({ where: { employeeId, status: 'active' } });
  if (!active || canChangeSalary(accessForLevel(access.groupId, target), active)) return true;
  if (!canChangeSalary(access, active)) return false;
  await active.update({ ownerCompanyId: target.companyId, ownerBrandId: target.brandId || null, updatedByUserId: userId });
  return true;
}

async function notifyRequesters(rows, approve, note) {
  const byUser = new Map();
  for (const r of rows) {
    if (!r.requestedByUserId) continue;
    const key = String(r.requestedByUserId);
    if (!byUser.has(key)) byUser.set(key, { companyId: r.toCompanyId, names: [] });
    byUser.get(key).names.push(r.employee ? r.employee.name : 'an employee');
  }
  for (const [userId, { companyId, names }] of byUser) {
    const who = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
    // eslint-disable-next-line no-await-in-loop
    await deliver([{ userId, companyId }], {
      fallbackCompanyId: companyId,
      type: approve ? 'payroll_release_approved' : 'payroll_release_rejected',
      title: approve ? `Salary release approved (${plural(names.length, 'employee')})` : `Salary release rejected (${plural(names.length, 'employee')})`,
      body: approve
        ? `You can now assign your own template to ${who}. Their current salary keeps running until you do.`
        : `${who} stays on the current salary. Reason: ${note}`,
    });
  }
}

// ---- Direct release (owner level, no request) -------------------------------

// body: { employeeIds[], to: 'company' | 'brand' } — hands each employee's
// current salary down to their own company or brand. Open requests the
// handover satisfies are closed as approved.
async function releaseDirect(access, { body, userId }) {
  const to = body.to === 'brand' ? 'brand' : body.to === 'company' ? 'company' : null;
  if (!to) throw new HttpError(400, 'Choose whether to release to the company or the brand');
  if (access.level === 'brand' || (access.level === 'company' && to === 'company')) {
    throw new HttpError(400, 'You can only release to a level below yours');
  }
  const ids = idList(body.employeeIds);

  const { released, skipped, closed } = await asGroup(async () => {
    const companyIds = access.level === 'group' ? await groupCompanyIds(access.groupId) : null;
    const where = companyIds ? { companyId: { [Op.in]: companyIds } } : await scopedEmployeeWhere(access);
    const employees = await db.Employee.findAll({ where: { ...where, id: { [Op.in]: ids } }, attributes: EMPLOYEE_ATTRS });
    const byId = new Map(employees.map((e) => [String(e.id), e]));
    const salaries = await activeSalaries(ids);
    const releasedRows = [];
    const skippedRows = [];
    const closedRows = [];
    for (const id of ids) {
      const employee = byId.get(id);
      const skip = (why) => skippedRows.push({ employeeId: id, name: employee ? employee.name : null, reason: why });
      if (!employee) {
        skip('Not in your payroll scope');
        continue;
      }
      const active = salaries.get(id);
      if (!active) {
        skip('No current salary — anyone in scope can assign one');
        continue;
      }
      if (!canChangeSalary(access, active)) {
        skip('Managed above your level');
        continue;
      }
      if (to === 'brand' && !employee.brandId) {
        skip('Not in a brand');
        continue;
      }
      const target = { companyId: String(employee.companyId), brandId: to === 'brand' ? String(employee.brandId) : null };
      if (sameOwner(salaryOwner(active), target)) {
        skip(`Already managed by their ${to}`);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await active.update({ ownerCompanyId: target.companyId, ownerBrandId: target.brandId, updatedByUserId: userId });
      releasedRows.push(active);

      // eslint-disable-next-line no-await-in-loop
      const open = await db.PayrollReleaseRequest.findAll({
        where: { employeeId: id, status: 'pending' },
        include: [{ model: db.Employee, as: 'employee', attributes: EMPLOYEE_ATTRS }],
      });
      for (const r of open) {
        const requester = accessForLevel(access.groupId, { companyId: r.toCompanyId, brandId: r.toBrandId });
        if (!canChangeSalary(requester, active)) continue;
        // eslint-disable-next-line no-await-in-loop
        await r.update({ status: 'approved', decidedByUserId: userId, decidedAt: new Date(), decisionNote: 'Released directly' });
        closedRows.push(r);
      }
    }
    return { released: releasedRows, skipped: skippedRows, closed: closedRows };
  });

  if (closed.length > 0) setImmediate(() => notifyRequesters(closed, true, null));
  return { released: released.length, skipped };
}

// "Acme" / "Acme › North" for a level, "The Group" for the Group.
async function levelName(groupId, owner) {
  if (!owner.companyId) return 'The Group';
  const [company, brand] = await asGroup(() =>
    Promise.all([
      db.Company.findByPk(owner.companyId, { attributes: ['name'] }),
      owner.brandId ? db.Brand.findByPk(owner.brandId, { attributes: ['name'] }) : null,
    ])
  );
  const name = company ? company.name : LEVEL_NAMES.company;
  return brand ? `${name} › ${brand.name}` : name;
}

module.exports = {
  requestRelease,
  cancelRelease,
  listReleaseRequests,
  pendingIncomingCount,
  decideRelease,
  releaseDirect,
};
