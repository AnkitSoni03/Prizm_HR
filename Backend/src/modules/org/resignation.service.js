'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const { getGroupCompanyIds, getManagersForEmployee, getManagedEmployeeIds } = require('../../utils/managerScope');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { sendMail } = require('../../utils/mailer');
const sseHub = require('../../utils/sseHub');
const { dateOnly } = require('../../utils/dateRange');

// Resignations. Flow:
//   1. An employee submits (reason + optional requested last working date).
//      Their managers, their assigned HR (employees.hr_employee_id) and every
//      Company Admin / Brand Admin / HR Manager (resignation:read holders) of
//      their company get a dashboard notification AND an email.
//   2. ONLY the assigned HR can accept/reject (with a comment; required on
//      reject). Managers and admins are view-only. The HR may sit in any
//      company of the employee's Group, same as managers.
//   3. The employee is notified (dashboard + email) of the decision.
// No HR assigned → the resignation still submits; it simply waits until an
// admin assigns one (notifyHrOfPendingResignation then tells that HR).
//
// Several of these reads cross companies (an HR or manager in a sibling
// company), so Employee/User/UserRole lookups here run with the tenant hook
// off and pin ids / company ids explicitly.
const unscoped = (fn) => runAsCompany(null, fn);

const EMPLOYEE_ATTRIBUTES = ['id', 'name', 'employeeCode', 'companyId', 'brandId', 'userId', 'hrEmployeeId', 'status'];

const LIST_INCLUDE = [
  {
    model: db.Employee,
    as: 'employee',
    attributes: EMPLOYEE_ATTRIBUTES,
    include: [
      { model: db.Company, as: 'company', attributes: ['id', 'name'] },
      { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
      { model: db.Department, as: 'department', attributes: ['id', 'name'] },
      { model: db.Designation, as: 'designation', attributes: ['id', 'title'] },
      { model: db.Employee, as: 'hrEmployee', attributes: ['id', 'name', 'employeeCode'] },
    ],
  },
  { model: db.Employee, as: 'decidedByEmployee', attributes: ['id', 'name', 'employeeCode'] },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return null;
  const [y, m, d] = String(value).split('-');
  return `${d}-${m}-${y}`;
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function employeeLabel(employee) {
  if (!employee) return 'An employee';
  return employee.employeeCode ? `${employee.name} (${employee.employeeCode})` : employee.name || 'An employee';
}

function frontendUrl(path) {
  const origin = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${origin}${path}`;
}

async function loadEmployee(employeeId) {
  return unscoped(() =>
    db.Employee.findOne({
      where: { id: employeeId },
      attributes: EMPLOYEE_ATTRIBUTES,
      include: [
        { model: db.Company, as: 'company', attributes: ['id', 'name'] },
        { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
      ],
    })
  );
}

async function loadUsers(userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (ids.length === 0) return [];
  return unscoped(() =>
    db.User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'email', 'isActive'] })
  );
}

// Everyone told about a resignation: managers, assigned HR, and every
// resignation:read holder (Company Admin / Brand Admin / HR Manager) of the
// employee's company — brand-scoped holders only for the employee's Brand.
// Returns [{ userId, companyId }] (each recipient's notification row lives
// in their OWN company, so a cross-company manager/HR sees it), deduped,
// never including the employee themselves.
async function resolveRecipients(employee) {
  const recipients = new Map();
  const add = (userId, companyId) => {
    if (!userId || String(userId) === String(employee.userId)) return;
    if (!recipients.has(String(userId))) recipients.set(String(userId), { userId, companyId });
  };

  const managers = await getManagersForEmployee({ companyId: employee.companyId, employeeId: employee.id });
  managers.forEach((manager) => add(manager.userId, manager.companyId));

  if (employee.hrEmployeeId) {
    const hr = await unscoped(() =>
      db.Employee.findOne({ where: { id: employee.hrEmployeeId }, attributes: ['id', 'userId', 'companyId'] })
    );
    if (hr) add(hr.userId, hr.companyId);
  }

  const brandWhere = employee.brandId ? { [Op.or]: [{ brandId: null }, { brandId: employee.brandId }] } : { brandId: null };
  const grants = await unscoped(() =>
    db.UserRole.findAll({
      where: { companyId: employee.companyId, ...brandWhere },
      include: [
        {
          model: db.Role,
          as: 'role',
          required: true,
          include: [{ model: db.Permission, as: 'permissions', where: { code: 'resignation:read' }, required: true }],
        },
      ],
    })
  );
  grants.forEach((grant) => add(grant.userId, employee.companyId));

  return [...recipients.values()];
}

// Dashboard notification + email per recipient. Best-effort, logged-not-
// thrown (same convention as utils/notifications.js): delivery problems
// never undo the resignation write itself.
async function deliver({ recipients, requestId, type, title, body, email }) {
  try {
    const users = await loadUsers(recipients.map((r) => r.userId));
    const userById = new Map(users.map((u) => [String(u.id), u]));

    await Promise.all(
      recipients.map(async ({ userId, companyId }) => {
        try {
          const notification = await db.Notification.create({
            companyId,
            userId,
            type,
            requestType: 'resignation',
            requestId,
            title,
            body: body || null,
          });
          sseHub.sendToUser(userId, notification.toJSON());
        } catch (err) {
          console.error('Failed to create resignation notification:', err);
        }
      })
    );

    if (!email) return;
    const results = await Promise.allSettled(
      recipients.map(({ userId }) => {
        const user = userById.get(String(userId));
        if (!user || !user.email || user.isActive === false) return null;
        return sendMail({ to: user.email, ...email });
      })
    );
    results
      .filter((result) => result.status === 'rejected')
      .forEach((result) => console.error('Failed to send resignation email:', result.reason?.message || result.reason));
  } catch (err) {
    console.error('Failed to deliver resignation notifications:', err);
  }
}

function emailBlock({ heading, rows, note, linkPath, linkLabel }) {
  const rowHtml = rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:4px 0;">${escapeHtml(value).replace(/\n/g, '<br/>')}</td></tr>`
    )
    .join('');
  const text = [heading, ...rows.filter(([, v]) => v).map(([l, v]) => `${l}: ${v}`), note || '', frontendUrl(linkPath)]
    .filter(Boolean)
    .join('\n');
  return {
    html: `
      <p style="font-size:16px;font-weight:bold;">${escapeHtml(heading)}</p>
      <table style="border-collapse:collapse;font-size:14px;">${rowHtml}</table>
      ${note ? `<p style="font-size:14px;">${escapeHtml(note)}</p>` : ''}
      <p><a href="${frontendUrl(linkPath)}">${escapeHtml(linkLabel)}</a></p>
    `,
    text,
  };
}

function orgLabel(employee) {
  return [employee.company?.name, employee.brand?.name].filter(Boolean).join(' › ');
}

// ---------------------------------------------------------------------------
// Employee side
// ---------------------------------------------------------------------------

async function submitResignation({ employeeId, reason, requestedLastWorkingDate }) {
  const trimmedReason = String(reason || '').trim();
  if (!trimmedReason) throw new HttpError(400, 'reason is required');
  if (trimmedReason.length > 5000) throw new HttpError(400, 'reason is too long (max 5000 characters)');
  if (requestedLastWorkingDate) {
    if (!isValidDateString(requestedLastWorkingDate)) throw new HttpError(400, 'lastWorkingDate must be YYYY-MM-DD');
    if (requestedLastWorkingDate < dateOnly(new Date())) {
      throw new HttpError(400, 'Last working date cannot be in the past');
    }
  }

  const employee = await loadEmployee(employeeId);
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (['exited', 'archived'].includes(employee.status)) {
    throw new HttpError(409, 'You have already exited this company');
  }

  const existing = await db.Resignation.findOne({ where: { employeeId, status: 'pending' } });
  if (existing) throw new HttpError(409, 'You already have a pending resignation');

  let resignation;
  try {
    resignation = await db.Resignation.create({
      companyId: employee.companyId,
      employeeId,
      reason: trimmedReason,
      requestedLastWorkingDate: requestedLastWorkingDate || null,
      status: 'pending',
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'You already have a pending resignation');
    }
    throw err;
  }

  const [recipients, employeeUser] = await Promise.all([
    resolveRecipients(employee),
    employee.userId ? loadUsers([employee.userId]).then((users) => users[0]) : null,
  ]);
  const name = employeeLabel(employee);
  const lwd = formatDate(requestedLastWorkingDate);
  const noHrNote = employee.hrEmployeeId
    ? null
    : 'No HR is assigned to this employee yet. Assign one so the resignation can be accepted or rejected.';

  const { html, text } = emailBlock({
    heading: `${name} has submitted a resignation`,
    rows: [
      ['Employee', name],
      ['Company', orgLabel(employee)],
      ['Requested last working day', lwd],
      ['Reason', trimmedReason],
    ],
    note: noHrNote,
    linkPath: '/login',
    linkLabel: 'Open HRMS to view it',
  });

  await deliver({
    recipients,
    requestId: resignation.id,
    type: 'resignation_submitted',
    title: `Resignation submitted: ${name}`,
    body: [lwd ? `Requested last working day: ${lwd}.` : null, `Reason: ${trimmedReason}`, noHrNote]
      .filter(Boolean)
      .join(' '),
    email: {
      subject: `Resignation: ${name}`,
      html,
      text,
      replyTo: employeeUser?.email,
      fromDisplayName: `${employee.name || 'Employee'} (via HRMS)`,
    },
  });

  return getResignationById(resignation.id);
}

async function withdrawResignation({ employeeId, id }) {
  const resignation = await db.Resignation.findOne({ where: { id, employeeId } });
  if (!resignation) throw new HttpError(404, 'Resignation not found');
  if (resignation.status !== 'pending') throw new HttpError(409, 'Only a pending resignation can be withdrawn');

  await resignation.update({ status: 'withdrawn', withdrawnAt: new Date() });

  const employee = await loadEmployee(employeeId);
  const recipients = await resolveRecipients(employee);
  const employeeUser = employee.userId ? (await loadUsers([employee.userId]))[0] : null;
  const name = employeeLabel(employee);
  const { html, text } = emailBlock({
    heading: `${name} has withdrawn their resignation`,
    rows: [
      ['Employee', name],
      ['Company', orgLabel(employee)],
    ],
    linkPath: '/login',
    linkLabel: 'Open HRMS',
  });
  await deliver({
    recipients,
    requestId: resignation.id,
    type: 'resignation_withdrawn',
    title: `Resignation withdrawn: ${name}`,
    body: `${name} withdrew their resignation.`,
    email: {
      subject: `Resignation withdrawn: ${name}`,
      html,
      text,
      replyTo: employeeUser?.email,
      fromDisplayName: `${employee.name || 'Employee'} (via HRMS)`,
    },
  });

  return getResignationById(resignation.id);
}

async function listMyResignations({ employeeId }) {
  const [rows, employee] = await Promise.all([
    db.Resignation.findAll({ where: { employeeId }, include: LIST_INCLUDE, order: [['id', 'DESC']] }),
    unscoped(() =>
      db.Employee.findOne({
        where: { id: employeeId },
        attributes: ['id', 'hrEmployeeId'],
        include: [{ model: db.Employee, as: 'hrEmployee', attributes: ['id', 'name', 'employeeCode'] }],
      })
    ),
  ]);
  return { rows, hr: employee?.hrEmployee || null };
}

// ---------------------------------------------------------------------------
// Reviewer side
// ---------------------------------------------------------------------------

async function getResignationById(id) {
  return unscoped(() => db.Resignation.findOne({ where: { id }, include: LIST_INCLUDE }));
}

function withFlags(rows, callerEmployeeId) {
  return rows.map((row) => {
    const plain = row.toJSON();
    const isAssignedHr =
      callerEmployeeId != null && String(plain.employee?.hrEmployeeId ?? '') === String(callerEmployeeId);
    return { ...plain, isAssignedHr, canDecide: isAssignedHr && plain.status === 'pending' };
  });
}

// Company/brand view (Company Admin / Brand Admin / HR Manager) — view-only.
async function listCompanyResignations({ companyId, brandIds, status, limit, offset }) {
  const where = { companyId };
  if (status) where.status = status;
  const employeeWhere = brandIds ? { brandId: { [Op.in]: brandIds } } : undefined;

  const include = LIST_INCLUDE.map((entry) =>
    entry.as === 'employee' && employeeWhere ? { ...entry, where: employeeWhere, required: true } : entry
  );
  const { rows, count } = await db.Resignation.findAndCountAll({
    where,
    include,
    order: [['id', 'DESC']],
    limit,
    offset,
    distinct: true,
  });
  return { rows: withFlags(rows, null), count };
}

// ESS "Team" view: resignations of employees the caller is the assigned HR
// for (decidable) or a manager of (view-only) — any company of their Group.
async function listTeamResignations({ companyId, callerEmployeeId, canReadReports, status, limit, offset }) {
  if (!callerEmployeeId) return { rows: [], count: 0 };
  const groupCompanyIds = await getGroupCompanyIds(companyId);
  if (groupCompanyIds.length === 0) return { rows: [], count: 0 };

  const [hrOf, reports] = await Promise.all([
    unscoped(() =>
      db.Employee.findAll({
        where: { hrEmployeeId: callerEmployeeId, companyId: { [Op.in]: groupCompanyIds } },
        attributes: ['id'],
      })
    ),
    canReadReports ? getManagedEmployeeIds({ companyId, managerEmployeeId: callerEmployeeId }) : [],
  ]);
  const employeeIds = [...new Set([...hrOf.map((e) => String(e.id)), ...reports.map(String)])];
  if (employeeIds.length === 0) return { rows: [], count: 0 };

  const where = { employeeId: { [Op.in]: employeeIds }, companyId: { [Op.in]: groupCompanyIds } };
  if (status) where.status = status;
  const { rows, count } = await unscoped(() =>
    db.Resignation.findAndCountAll({ where, include: LIST_INCLUDE, order: [['id', 'DESC']], limit, offset, distinct: true })
  );
  return { rows: withFlags(rows, callerEmployeeId), count };
}

// Accept / reject — ONLY the employee's currently assigned HR. The route
// already checked resignation:decide_assigned; everything else is checked
// here against the loaded record, never client input. Anything outside the
// caller's Group is a 404.
async function decideResignation({ auth, id, action, comment, lastWorkingDate }) {
  if (!['accept', 'reject'].includes(action)) throw new HttpError(400, "action must be 'accept' or 'reject'");
  const trimmedComment = String(comment || '').trim();
  if (action === 'reject' && !trimmedComment) throw new HttpError(400, 'A reason is required to reject');
  if (trimmedComment.length > 5000) throw new HttpError(400, 'comment is too long (max 5000 characters)');
  if (lastWorkingDate && !isValidDateString(lastWorkingDate)) {
    throw new HttpError(400, 'lastWorkingDate must be YYYY-MM-DD');
  }

  const resignation = await unscoped(() => db.Resignation.findOne({ where: { id } }));
  if (!resignation) throw new HttpError(404, 'Resignation not found');
  const groupCompanyIds = await getGroupCompanyIds(auth.companyId);
  if (!groupCompanyIds.includes(String(resignation.companyId))) throw new HttpError(404, 'Resignation not found');

  const employee = await loadEmployee(resignation.employeeId);
  if (!employee) throw new HttpError(404, 'Resignation not found');
  if (auth.employeeId == null || String(employee.hrEmployeeId ?? '') !== String(auth.employeeId)) {
    throw new HttpError(403, 'Only the HR assigned to this employee can accept or reject this resignation');
  }
  if (resignation.status !== 'pending') throw new HttpError(409, 'This resignation has already been decided');

  const finalLwd = action === 'accept' ? lastWorkingDate || resignation.requestedLastWorkingDate || null : null;

  await db.sequelize.transaction(async (transaction) => {
    await resignation.update(
      {
        status: action === 'accept' ? 'accepted' : 'rejected',
        decisionComment: trimmedComment || null,
        lastWorkingDate: finalLwd,
        decidedByUserId: auth.userId,
        decidedByEmployeeId: auth.employeeId,
        decidedAt: new Date(),
      },
      { transaction }
    );
    // Accepted → the employee is now serving notice (leave accrual etc.
    // already treat 'on_notice' as still employed).
    if (action === 'accept' && ['onboarding', 'active'].includes(employee.status)) {
      await db.Employee.update(
        { status: 'on_notice' },
        { where: { id: employee.id, companyId: employee.companyId }, transaction, hooks: false }
      );
    }
    await recordApprovalDecision({
      companyId: resignation.companyId,
      requestType: 'resignation',
      requestId: resignation.id,
      action: action === 'accept' ? 'approved' : 'rejected',
      actorUserId: auth.userId,
      actorEmployeeId: auth.employeeId,
      reason: trimmedComment || null,
      transaction,
    });
  });

  // Pay stops after the last working day — redo the months not locked yet
  // and settle the running month if that day has already come.
  if (action === 'accept' && finalLwd) {
    require('../payroll/payrollEngine').afterEmployeePayChange(employee.id, finalLwd);
  }

  // Tell the employee (dashboard + email), from the HR.
  const hr = await loadEmployee(auth.employeeId);
  const hrUser = auth.userId ? (await loadUsers([auth.userId]))[0] : null;
  const accepted = action === 'accept';
  const lwd = formatDate(finalLwd);
  const { html, text } = emailBlock({
    heading: accepted ? 'Your resignation has been accepted' : 'Your resignation has been rejected',
    rows: [
      ['Decided by', hr ? `${hr.name} (HR)` : 'HR'],
      ['Last working day', accepted ? lwd : null],
      [accepted ? 'Comment' : 'Reason', trimmedComment || null],
    ],
    linkPath: '/ess/resignation',
    linkLabel: 'View in HRMS',
  });
  if (employee.userId) {
    await deliver({
      recipients: [{ userId: employee.userId, companyId: employee.companyId }],
      requestId: resignation.id,
      type: accepted ? 'resignation_accepted' : 'resignation_rejected',
      title: accepted ? 'Your resignation was accepted' : 'Your resignation was rejected',
      body: [accepted && lwd ? `Last working day: ${lwd}.` : null, trimmedComment || null].filter(Boolean).join(' ') || null,
      email: {
        subject: accepted ? 'Your resignation has been accepted' : 'Your resignation has been rejected',
        html,
        text,
        replyTo: hrUser?.email,
        fromDisplayName: `${hr?.name || 'HR'} (via HRMS)`,
      },
    });
  }

  const updated = await getResignationById(resignation.id);
  return withFlags([updated], auth.employeeId)[0];
}

// Called when an admin (re)assigns an employee's HR: if that employee has a
// pending resignation, the new HR is told it's waiting on them. Best-effort.
async function notifyHrOfPendingResignation(employeeId) {
  try {
    const pending = await unscoped(() => db.Resignation.findOne({ where: { employeeId, status: 'pending' } }));
    if (!pending) return;
    const employee = await loadEmployee(employeeId);
    if (!employee?.hrEmployeeId) return;
    const hr = await unscoped(() =>
      db.Employee.findOne({ where: { id: employee.hrEmployeeId }, attributes: ['id', 'userId', 'companyId'] })
    );
    if (!hr?.userId) return;
    const name = employeeLabel(employee);
    const employeeUser = employee.userId ? (await loadUsers([employee.userId]))[0] : null;
    const { html, text } = emailBlock({
      heading: `You are now the HR for ${name}, who has a pending resignation`,
      rows: [
        ['Employee', name],
        ['Company', orgLabel(employee)],
        ['Requested last working day', formatDate(pending.requestedLastWorkingDate)],
        ['Reason', pending.reason],
      ],
      linkPath: '/ess/resignation',
      linkLabel: 'Review it in HRMS',
    });
    await deliver({
      recipients: [{ userId: hr.userId, companyId: hr.companyId }],
      requestId: pending.id,
      type: 'resignation_submitted',
      title: `Resignation waiting for you: ${name}`,
      body: `You were assigned as HR for ${name}. Their resignation is waiting for your decision.`,
      email: {
        subject: `Resignation waiting for your decision: ${name}`,
        html,
        text,
        replyTo: employeeUser?.email,
        fromDisplayName: `${employee.name || 'Employee'} (via HRMS)`,
      },
    });
  } catch (err) {
    console.error('Failed to notify new HR of pending resignation:', err);
  }
}

module.exports = {
  submitResignation,
  withdrawResignation,
  listMyResignations,
  listCompanyResignations,
  listTeamResignations,
  decideResignation,
  notifyHrOfPendingResignation,
};
