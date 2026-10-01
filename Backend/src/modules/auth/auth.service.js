'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { sendActivationEmail } = require('../../utils/mailer');
const { runWithTenant } = require('../../config/tenant-context');
const { ensureCustomRoleGrant } = require('../../utils/customPowerSync');
const { buildObjectPath, uploadBuffer, getSignedDownloadUrl, deleteObject } = require('../../utils/gcs');
const { isCompanyInactive } = require('../../utils/companyStatus');
const { grantWhere } = require('../../middleware/rbac.middleware');
const { resolveEscalationContact } = require('../../utils/accountEscalation');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateOpaqueToken,
  hashToken,
  daysFromNow,
  minutesFromNow,
} = require('../../utils/tokens');

const BCRYPT_ROUNDS = 12;
const INVITATION_TTL_DAYS = 7;
const PASSWORD_RESET_TTL_MINUTES = 10;

// Sends the activation email as part of the invite transaction itself
// (called from inside a `db.sequelize.transaction` callback below) rather
// than fire-and-forget after the response — a failed send throws here,
// which rolls back the whole transaction, so no User/Invitation row is ever
// left behind for an invite whose email never actually reached the
// recipient. Wraps the raw SMTP error in an HttpError so the caller gets a
// clean, actionable message instead of a nodemailer stack trace.
async function sendActivationEmailOrThrow({ to, activationToken }) {
  try {
    await sendActivationEmail({ to, activationToken });
  } catch (err) {
    console.error('Activation email send failed:', err);
    // SMTP auth/connection failures are a server config problem, not a bad
    // recipient — don't send the admin off re-checking the email address.
    if (['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(err.code)) {
      throw new HttpError(502, 'Email service is not configured correctly on the server. Please contact support.');
    }
    throw new HttpError(502, 'Failed to send the invitation email. Please check the email address and try again.');
  }
}

// Refresh tokens are stateless signed JWTs (utils/tokens.js), not rows in a
// session table — see the tokenVersion column on User for how they're
// invalidated. No DB write happens here at all; issuing a token pair is now
// pure computation.
function issueTokenPair(user) {
  const accessToken = signAccessToken({
    sub: user.id,
    companyId: user.companyId,
    groupId: user.groupId,
    employeeId: user.employeeId,
  });

  const refreshToken = signRefreshToken({ userId: user.id, tokenVersion: user.tokenVersion });

  return { accessToken, refreshToken };
}

// Super Admin invites a Company Admin for an existing company. The role is
// only granted (user_roles row created) at activation time — invitations
// just carry the role_id to grant, per PHASE1_MODELS.md's
// "role_id ... Role granted on activation".
async function inviteCompanyAdmin({ companyId, email, name }) {
  const company = await db.Company.findByPk(companyId);
  if (!company) throw new HttpError(404, 'Company not found');

  const role = await db.Role.findOne({ where: { name: 'Company Admin', isSystem: true } });
  if (!role) throw new HttpError(500, 'Company Admin role is not seeded');

  const existing = await db.User.findOne({ where: { companyId, email } });
  if (existing) throw new HttpError(409, 'A user with this email already exists for this company');

  const rawToken = generateOpaqueToken();

  const { user, invitation } = await db.sequelize.transaction(async (t) => {
    const createdUser = await db.User.create(
      { companyId, email, name: name || null, status: 'invited', invitedAt: new Date() },
      { transaction: t }
    );

    const createdInvitation = await db.Invitation.create(
      {
        companyId,
        email,
        roleId: role.id,
        brandId: null,
        tokenHash: hashToken(rawToken),
        expiresAt: daysFromNow(INVITATION_TTL_DAYS),
      },
      { transaction: t }
    );

    await sendActivationEmailOrThrow({ to: email, activationToken: rawToken });

    return { user: createdUser, invitation: createdInvitation };
  });

  return { user, invitation, activationToken: rawToken };
}

// Mirrors inviteCompanyAdmin, but keyed on groupId instead of companyId.
// A Group's first admin is a platform-level user (company_id NULL), same as
// Super Admin, distinguished by group_id being set — see requireSuperAdmin
// in auth.middleware.js.
async function inviteGroupAdmin({ groupId, email, name }) {
  const group = await db.Group.findByPk(groupId);
  if (!group) throw new HttpError(404, 'Group not found');

  const role = await db.Role.findOne({ where: { name: 'Group Admin', isSystem: true } });
  if (!role) throw new HttpError(500, 'Group Admin role is not seeded');

  const existing = await db.User.findOne({ where: { groupId, email } });
  if (existing) throw new HttpError(409, 'A user with this email already exists for this group');

  const rawToken = generateOpaqueToken();

  const { user, invitation } = await db.sequelize.transaction(async (t) => {
    const createdUser = await db.User.create(
      { groupId, companyId: null, email, name: name || null, status: 'invited', invitedAt: new Date() },
      { transaction: t }
    );

    const createdInvitation = await db.Invitation.create(
      {
        groupId,
        companyId: null,
        email,
        roleId: role.id,
        brandId: null,
        tokenHash: hashToken(rawToken),
        expiresAt: daysFromNow(INVITATION_TTL_DAYS),
      },
      { transaction: t }
    );

    await sendActivationEmailOrThrow({ to: email, activationToken: rawToken });

    return { user: createdUser, invitation: createdInvitation };
  });

  return { user, invitation, activationToken: rawToken };
}

// Mirrors inviteCompanyAdmin, but keyed on brandId. Unlike inviteGroupAdmin
// (a Group Admin is platform-level, company_id NULL), a Brand Admin's
// user_roles row needs companyId set to the brand's owning company —
// rbac.middleware.js's userHasPermission scopes UserRole lookups to
// req.auth.companyId, so a null companyId would never match once the Brand
// Admin logs in. brandId is carried on the Invitation (and, at activation,
// on the created UserRole) so the grant is scoped to this one Brand, not
// every Brand in the company.
async function inviteBrandAdmin({ brandId, email, name }) {
  const brand = await db.Brand.findByPk(brandId);
  if (!brand) throw new HttpError(404, 'Brand not found');
  const companyId = brand.companyId;

  const role = await db.Role.findOne({ where: { name: 'Brand Admin', isSystem: true } });
  if (!role) throw new HttpError(500, 'Brand Admin role is not seeded');

  const existing = await db.User.findOne({ where: { companyId, email } });
  if (existing) throw new HttpError(409, 'A user with this email already exists for this company');

  const rawToken = generateOpaqueToken();

  const { user, invitation } = await db.sequelize.transaction(async (t) => {
    const createdUser = await db.User.create(
      { companyId, email, name: name || null, status: 'invited', invitedAt: new Date() },
      { transaction: t }
    );

    const createdInvitation = await db.Invitation.create(
      {
        companyId,
        groupId: null,
        email,
        roleId: role.id,
        brandId,
        tokenHash: hashToken(rawToken),
        expiresAt: daysFromNow(INVITATION_TTL_DAYS),
      },
      { transaction: t }
    );

    await sendActivationEmailOrThrow({ to: email, activationToken: rawToken });

    return { user: createdUser, invitation: createdInvitation };
  });

  return { user, invitation, activationToken: rawToken };
}

// Company Admin/HR invites an existing Employee record's occupant to become
// an ESS user. Unlike inviteCompanyAdmin/inviteGroupAdmin (which only carry
// the role_id to grant at activation), this also sets users.employee_id
// immediately — that's the field req.auth.employeeId (and therefore every
// *_own-scoped permission check throughout the app) is sourced from, so the
// login must be employee-linked from the moment the User row exists, not
// deferred to activation the way the role grant is. employees.user_id is
// updated in the same transaction so the link is bidirectional.
// brandId is optional and only ever sent by a brand-scoped caller (Brand
// Admin) — Company Admin/HR Manager's own invite call never sends it, since
// their grant is already company-wide. When present, it's a defense-in-depth
// check on top of rbac.middleware.js's requirePermission (which already
// validated the caller holds user:invite for this brandId): a Brand Admin
// must not be able to invite an employee outside their own brand just by
// omitting/spoofing this field, since the RBAC check alone can't see which
// employee is being targeted.
async function inviteEmployeeUser({ companyId, employeeId, email, brandId, scopedBrandIds }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (brandId && String(employee.brandId) !== String(brandId)) {
    throw new HttpError(403, "Employee does not belong to the caller's brand");
  }
  // The check above only fires if the client bothered to send brandId — a
  // brand-scoped caller (Brand Admin) simply omitting it used to invite any
  // employee in the company. scopedBrandIds is derived server-side from the
  // caller's own UserRole grants (see rbac.middleware.js), so this holds
  // even when brandId is absent from the request entirely.
  if (
    scopedBrandIds &&
    !scopedBrandIds.some((scopedBrandId) => String(scopedBrandId) === String(employee.brandId))
  ) {
    throw new HttpError(403, "Employee does not belong to the caller's brand");
  }
  if (employee.userId) throw new HttpError(409, 'This employee already has a linked user account');

  // Role is a system-level table (company_id IS NULL) and tenant-scoped
  // (src/models/hooks/tenant-scope.js beforeFind hook). Called by a Company
  // Admin, this runs under a non-null tenant context, which would otherwise
  // silently filter this lookup to zero results — CLAUDE.md's "tenant-scope
  // hook + system-level rows" gotcha. inviteCompanyAdmin/inviteGroupAdmin
  // never hit this because they're Super-Admin-only (context already null);
  // nest a null-company context for just this one query instead.
  const role = await runWithTenant({ companyId: null }, () =>
    db.Role.findOne({ where: { name: 'Employee', isSystem: true } })
  );
  if (!role) throw new HttpError(500, 'Employee role is not seeded');

  const existing = await db.User.findOne({ where: { companyId, email } });
  if (existing) throw new HttpError(409, 'A user with this email already exists for this company');

  const rawToken = generateOpaqueToken();

  const { user, invitation } = await db.sequelize.transaction(async (t) => {
    const createdUser = await db.User.create(
      { companyId, email, employeeId: employee.id, status: 'invited', invitedAt: new Date() },
      { transaction: t }
    );

    const createdInvitation = await db.Invitation.create(
      {
        companyId,
        email,
        roleId: role.id,
        brandId: null,
        tokenHash: hashToken(rawToken),
        expiresAt: daysFromNow(INVITATION_TTL_DAYS),
      },
      { transaction: t }
    );

    await employee.update({ userId: createdUser.id }, { transaction: t });

    await sendActivationEmailOrThrow({ to: email, activationToken: rawToken });

    return { user: createdUser, invitation: createdInvitation };
  });

  return { user, invitation, activationToken: rawToken };
}

// Re-sends the activation email for an employee whose ESS login was invited
// but never activated (e.g. the employee opened the email after the link
// expired). Same email, same User row — every older unaccepted invitation for
// it is expired first so only the newest link works.
async function resendEmployeeInvite({ companyId, employeeId, brandId, scopedBrandIds }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (brandId && String(employee.brandId) !== String(brandId)) {
    throw new HttpError(403, "Employee does not belong to the caller's brand");
  }
  if (
    scopedBrandIds &&
    !scopedBrandIds.some((scopedBrandId) => String(scopedBrandId) === String(employee.brandId))
  ) {
    throw new HttpError(403, "Employee does not belong to the caller's brand");
  }
  if (!employee.userId) throw new HttpError(400, 'This employee has not been invited yet');

  const user = await db.User.findOne({ where: { id: employee.userId, companyId } });
  if (!user) throw new HttpError(404, 'Linked login not found');
  if (user.status !== 'invited') {
    throw new HttpError(409, 'This login is already activated — no invitation to resend');
  }

  // Same tenant-scope-hook dodge as inviteEmployeeUser — see its comment.
  const role = await runWithTenant({ companyId: null }, () =>
    db.Role.findOne({ where: { name: 'Employee', isSystem: true } })
  );
  if (!role) throw new HttpError(500, 'Employee role is not seeded');

  const rawToken = generateOpaqueToken();

  const invitation = await db.sequelize.transaction(async (t) => {
    await db.Invitation.update(
      { expiresAt: new Date() },
      { where: { companyId, email: user.email, acceptedAt: null }, transaction: t }
    );

    const createdInvitation = await db.Invitation.create(
      {
        companyId,
        email: user.email,
        roleId: role.id,
        brandId: null,
        tokenHash: hashToken(rawToken),
        expiresAt: daysFromNow(INVITATION_TTL_DAYS),
      },
      { transaction: t }
    );

    await user.update({ invitedAt: new Date() }, { transaction: t });

    await sendActivationEmailOrThrow({ to: user.email, activationToken: rawToken });

    return createdInvitation;
  });

  return { user, invitation, activationToken: rawToken };
}

// Case-insensitive exact email match. Emails are stored as typed (never
// normalized historically), so a plain `email = ?` lookup misses
// "Foo@x.com" vs "foo@x.com".
function emailEquals(email) {
  return db.sequelize.where(
    db.sequelize.fn('lower', db.sequelize.col('email')),
    String(email).trim().toLowerCase()
  );
}

// True when `user` is a dead ESS login that can safely be re-invited for
// another transfer (e.g. transferring an employee back to an email they used
// before): deactivated, linked to no employee, and holding nothing beyond
// the Employee role / custom power roles — never an admin account.
async function isReusableEssLogin(user, transaction) {
  if (user.deletedAt || user.isActive || user.employeeId) return false;
  const linked = await db.Employee.count({ where: { userId: user.id }, paranoid: false, transaction });
  if (linked > 0) return false;
  const grants = await db.UserRole.findAll({
    where: { userId: user.id },
    include: [{ model: db.Role, as: 'role', attributes: ['name', 'isSystem'], paranoid: false }],
    transaction,
  });
  return grants.every((g) => !g.role || !g.role.isSystem || g.role.name === 'Employee');
}

// Reassigns an existing ESS login to a new email — e.g. an employee wants to
// switch which inbox they use, without losing their identity/history (leave
// balances, approval history, etc. are keyed off employees.id). This call
// only creates a *pending* login for the new email (status 'invited',
// users.employee_id pointing at the employee) and emails its activation
// link — the current login keeps working untouched. The actual switchover
// (old login deactivated, its roles/notifications moved to the new one,
// employees.user_id repointed) happens in activateAccount, once the employee
// proves they control the new inbox. So a mistyped/unreachable new email can
// never lock the employee out.
async function transferEmployeeLogin({ companyId, employeeId, newEmail: rawNewEmail, brandId, scopedBrandIds }) {
  const newEmail = String(rawNewEmail || '').trim().toLowerCase();
  if (!newEmail) throw new HttpError(400, 'newEmail is required');

  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (brandId && String(employee.brandId) !== String(brandId)) {
    throw new HttpError(403, "Employee does not belong to the caller's brand");
  }
  // Same defense-in-depth as inviteEmployeeUser: scopedBrandIds is derived
  // server-side from the caller's own grants, so this still holds even if a
  // brand-scoped caller omits brandId from the request entirely.
  if (
    scopedBrandIds &&
    !scopedBrandIds.some((scopedBrandId) => String(scopedBrandId) === String(employee.brandId))
  ) {
    throw new HttpError(403, "Employee does not belong to the caller's brand");
  }
  if (!employee.userId) {
    throw new HttpError(400, 'This employee has no linked login to transfer — invite one first');
  }

  // Same tenant-scope-hook dodge as inviteEmployeeUser — see its comment.
  // Also used for the email lookups below: login() matches by email alone
  // across every tenant, so the new email must be free platform-wide (not
  // just in this company), and soft-deleted rows still hold the
  // (company_id, email) unique index, so they're checked too.
  const { role, currentUser, existing } = await runWithTenant({ companyId: null }, async () => ({
    role: await db.Role.findOne({ where: { name: 'Employee', isSystem: true } }),
    currentUser: await db.User.findByPk(employee.userId),
    existing: await db.User.findAll({ where: emailEquals(newEmail), paranoid: false }),
  }));
  if (!role) throw new HttpError(500, 'Employee role is not seeded');

  if (currentUser && currentUser.email.trim().toLowerCase() === newEmail) {
    throw new HttpError(400, 'This employee already logs in with that email');
  }

  // At most one existing row can be reused: a pending transfer for this
  // same employee (re-sending), or a dead ESS login in this company
  // (transferring back to an old email). Anything else is a real conflict.
  let reuse = null;
  for (const u of existing) {
    // A deleted row elsewhere neither logs in nor collides with this
    // company's (company_id, email) index.
    if (u.deletedAt && String(u.companyId) !== String(companyId)) continue;
    const samePending =
      !u.deletedAt && String(u.companyId) === String(companyId) &&
      String(u.employeeId) === String(employee.id) && u.status === 'invited';
    const deadLogin =
      String(u.companyId) === String(companyId) &&
      (await runWithTenant({ companyId: null }, () => isReusableEssLogin(u)));
    if ((samePending || deadLogin) && !reuse) reuse = u;
    else throw new HttpError(409, 'This email is already used by another account');
  }

  const rawToken = generateOpaqueToken();

  const { user, invitation } = await db.sequelize.transaction(async (t) =>
    runWithTenant({ companyId: null }, async () => {
      // Cancel any other still-pending transfer for this employee — only the
      // newest target email may take over the login.
      const stalePending = await db.User.findAll({
        where: {
          companyId,
          employeeId: employee.id,
          status: 'invited',
          id: { [Op.notIn]: [employee.userId, reuse?.id].filter(Boolean) },
        },
        transaction: t,
      });
      for (const stale of stalePending) {
        await db.Invitation.update(
          { expiresAt: new Date() },
          { where: { companyId, email: stale.email, acceptedAt: null }, transaction: t }
        );
        await stale.update({ employeeId: null, isActive: false }, { transaction: t });
      }

      let targetUser;
      if (reuse) {
        // Old grants on a dead login are dropped (hard-delete, same precedent
        // as assignEmployeePowers' role_permissions) — the current login's
        // grants are moved over at activation instead.
        await db.UserRole.destroy({ where: { userId: reuse.id }, force: true, transaction: t });
        await db.Invitation.update(
          { expiresAt: new Date() },
          { where: { companyId, email: reuse.email, acceptedAt: null }, transaction: t }
        );
        targetUser = await reuse.update(
          {
            employeeId: employee.id,
            status: 'invited',
            isActive: true,
            passwordHash: null,
            activatedAt: null,
            invitedAt: new Date(),
            tokenVersion: reuse.tokenVersion + 1,
          },
          { transaction: t }
        );
      } else {
        targetUser = await db.User.create(
          { companyId, email: newEmail, employeeId: employee.id, status: 'invited', invitedAt: new Date() },
          { transaction: t }
        );
      }

      const createdInvitation = await db.Invitation.create(
        {
          companyId,
          email: targetUser.email,
          roleId: role.id,
          brandId: null,
          tokenHash: hashToken(rawToken),
          expiresAt: daysFromNow(INVITATION_TTL_DAYS),
        },
        { transaction: t }
      );

      await sendActivationEmailOrThrow({ to: targetUser.email, activationToken: rawToken });

      return { user: targetUser, invitation: createdInvitation };
    })
  );

  return { user, invitation, activationToken: rawToken };
}

// Second half of transferEmployeeLogin: the new login has just been
// activated, so it now takes over from the employee's current one — every
// UserRole grant and notification moves across, the old login is
// deactivated (tokenVersion bump kills its refresh tokens everywhere;
// requireAuth's isActive check kills its access tokens), and
// employees.user_id is repointed. Returns true when a switchover happened.
async function completeLoginTransfer({ user, employee, transaction }) {
  const oldUserId = employee.userId;
  if (!oldUserId || String(oldUserId) === String(user.id)) return false;

  const oldUser = await db.User.findByPk(oldUserId, { transaction });
  if (oldUser) {
    await db.UserRole.update({ userId: user.id }, { where: { userId: oldUserId }, transaction });
    await db.Notification.update({ userId: user.id }, { where: { userId: oldUserId }, transaction });
    await oldUser.update(
      { employeeId: null, isActive: false, tokenVersion: oldUser.tokenVersion + 1 },
      { transaction }
    );
  }
  // Carry over an admin's deliberate deactivation of the employee.
  if (employee.isActive === false) await user.update({ isActive: false }, { transaction });
  await employee.update({ userId: user.id }, { transaction });
  return true;
}

async function activateAccount({ token, password }) {
  const invitation = await db.Invitation.findOne({ where: { tokenHash: hashToken(token) } });
  if (!invitation) throw new HttpError(400, 'Invalid activation token');
  if (invitation.acceptedAt) throw new HttpError(400, 'Invitation already used');
  if (invitation.expiresAt < new Date()) throw new HttpError(400, 'Invitation has expired');

  const user = await db.User.findOne({
    where: { companyId: invitation.companyId, email: invitation.email },
  });
  if (!user) throw new HttpError(404, 'Invited user not found');
  if (user.status === 'active') throw new HttpError(409, 'User already activated');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await db.sequelize.transaction(async (t) => {
    await user.update(
      { passwordHash, status: 'active', activatedAt: new Date() },
      { transaction: t }
    );

    // A pending login-transfer target (see transferEmployeeLogin) takes over
    // the employee's current login here, grants included — so the
    // invitation's own role is only added if that didn't already bring it.
    let employee = null;
    if (user.employeeId) {
      employee = await runWithTenant({ companyId: null }, () =>
        db.Employee.findByPk(user.employeeId, { transaction: t })
      );
      if (employee) {
        await runWithTenant({ companyId: null }, () =>
          completeLoginTransfer({ user, employee, transaction: t })
        );
      }
    }

    const grant = {
      userId: user.id,
      roleId: invitation.roleId,
      companyId: invitation.companyId,
      groupId: invitation.groupId,
      brandId: invitation.brandId,
    };
    const alreadyGranted = await runWithTenant({ companyId: null }, () =>
      db.UserRole.findOne({ where: grant, transaction: t })
    );
    if (!alreadyGranted) await db.UserRole.create(grant, { transaction: t });

    // Flips the Employee lifecycle status (distinct from the User login
    // status just set above) from 'onboarding' to 'active' the moment they
    // actually set their password — previously this only ever happened via
    // a manual edit in EmployeeDetailModal.tsx. Only touches an employee
    // still sitting in the default pre-activation 'onboarding' state, so it
    // never clobbers a deliberate later lifecycle change (e.g. an admin who
    // marked them 'on_notice'/'exited' before they got around to
    // activating their invite).
    if (employee && employee.status === 'onboarding') {
      await employee.update({ status: 'active' }, { transaction: t });
    }

    await invitation.update({ acceptedAt: new Date() }, { transaction: t });
  });

  // Best-effort, logged-not-thrown side effect (same convention as the
  // comp-off auto-detection wiring in attendance.service.js) — a bug here
  // must never block an employee from actually activating their login.
  // Only relevant for an ESS activation (user.employeeId set); Group/
  // Company/Brand Admin invitations never carry one. Retroactively grants
  // the UserRole for any custom "powers" Role already assigned to this
  // employee before they ever activated (assignEmployeePowers only creates
  // the grant immediately when the employee is already active; this is the
  // other half of that ordering).
  if (user.employeeId) {
    try {
      await ensureCustomRoleGrant({ employeeId: user.employeeId });
    } catch (err) {
      console.error('Custom power role grant sync failed:', err);
    }
  }

  return { user };
}

async function login({ email, password }) {
  // No tenant context exists yet at login, so this intentionally looks up
  // by email alone (email is only guaranteed unique per company_id, not
  // globally — a real deployment should use distinct emails per tenant).
  // Case-insensitive, and an active row wins over a deactivated one with the
  // same address (e.g. a login transferred away and later transferred back).
  const user = await db.User.findOne({
    where: emailEquals(email),
    order: [['isActive', 'DESC'], ['id', 'DESC']],
  });
  if (!user || !user.passwordHash) throw new HttpError(401, 'Invalid email or password');

  // Company-level block takes priority over the user's own status — it's
  // the more root-cause explanation ("the whole company was deactivated",
  // not "this one login"), and every one of that company's users hits it
  // identically regardless of their individual status.
  if (user.companyId) {
    const company = await db.Company.findByPk(user.companyId, { attributes: ['status'] });
    if (company && isCompanyInactive(company.status)) {
      throw new HttpError(
        403,
        "Your company's access has been deactivated by the platform administrator. Please contact the Super Admin to reactivate it.",
        'COMPANY_DEACTIVATED'
      );
    }
  }

  if (user.status !== 'active' || !user.isActive) {
    const contact = await resolveEscalationContact(user);
    throw new HttpError(
      403,
      `Your account has been deactivated. Please contact ${contact} to reactivate it.`,
      'ACCOUNT_DEACTIVATED'
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, 'Invalid email or password');

  await user.update({ lastLoginAt: new Date() });

  return issueTokenPair(user);
}

async function refresh({ refreshToken }) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  const user = await db.User.findByPk(payload.sub);
  if (!user || user.status !== 'active') {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  // The token's embedded tokenVersion must still match the user's current
  // one — this is the whole revocation mechanism now that there's no
  // per-token DB row. resetPassword/transferEmployeeLogin bump
  // user.tokenVersion, which instantly fails this check for every refresh
  // token issued before that bump, on every device, without looking
  // anything up per-token.
  if (payload.tokenVersion !== user.tokenVersion) {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  return issueTokenPair(user);
}

// Stateless refresh tokens can't be revoked individually — there's no
// per-token row to mark used, only the user-wide tokenVersion (which would
// log out every device, not just this one). So "logout" here is a no-op
// that exists purely so the endpoint keeps returning a clean 204 for the
// frontend's fire-and-forget call — the actual sign-out is the client
// discarding its stored tokens (tokenStore.ts::clearTokens). A leaked
// refresh token therefore stays valid until its own expiry (REFRESH_TOKEN_TTL_DAYS)
// even after the legitimate user clicks "Logout"; only a password
// reset/employee-login-transfer forces it dead early, for every session at once.
async function logout() {
  return { success: true };
}

// Roles/permissions are never embedded in the JWT (see issueTokenPair), so
// the frontend needs a live lookup. UserRole.companyId is always the same
// as the caller's own req.auth.companyId (set at invite/activation time),
// but a user can hold several rows here — one brand-wide (brand_id NULL)
// plus per-brand grants — hence findAll, not findOne. Walking Role via a
// nested include (rather than querying db.Role directly) is required to
// dodge the tenant-scope hook, which would otherwise silently filter out
// system roles (company_id IS NULL) for any non-Super-Admin caller — see
// CLAUDE.md's "tenant-scope hook + system-level rows" gotcha.
// While acting in a sibling company (group-level power), the tenant context
// is that company — but the caller's own User/Employee/UserRole rows all
// live in their home company, so this whole lookup runs with the tenant
// hook off (every query here already filters by the caller's own ids).
async function getCurrentUser(auth) {
  if (!auth.homeCompanyId) return loadCurrentUser(auth);
  return runWithTenant({ companyId: null }, () => loadCurrentUser(auth));
}

async function loadCurrentUser({ userId, companyId, homeCompanyId }) {
  const user = await db.User.findByPk(userId, {
    attributes: ['id', 'email', 'employeeId', 'photoUrl', 'name'],
  });
  if (!user) throw new HttpError(404, 'User not found');

  // Same grant selection rbac.middleware.js uses, so the permissions the
  // frontend gates on always match what the server will actually allow —
  // including while acting in a sibling company (only group-level grants).
  const userRoles = await db.UserRole.findAll({
    where: grantWhere({ userId, companyId, homeCompanyId }),
    include: [
      {
        model: db.Role,
        as: 'role',
        required: true,
        include: [{ model: db.Permission, as: 'permissions', attributes: ['code'] }],
      },
    ],
  });

  // Companies a group-level power holder can switch into (their own
  // included), and which one this request is acting in. Empty/null for
  // everyone else.
  const ownCompanyId = homeCompanyId || companyId;
  let groupPowerCompanies = [];
  if (ownCompanyId) {
    const groupGrant = await db.UserRole.findOne({
      where: { userId, companyId: ownCompanyId, groupId: { [Op.ne]: null } },
      attributes: ['groupId'],
    });
    if (groupGrant) {
      const companies = await db.Company.findAll({
        where: { groupId: groupGrant.groupId },
        attributes: ['id', 'name', 'status'],
        order: [['name', 'ASC']],
      });
      groupPowerCompanies = companies
        .filter((c) => String(c.id) === String(ownCompanyId) || !isCompanyInactive(c.status))
        .map((c) => ({ id: c.id, name: c.name, isHome: String(c.id) === String(ownCompanyId) }));
    }
  }

  const roles = userRoles.map((userRole) => ({
    name: userRole.role.name,
    companyId: userRole.companyId,
    groupId: userRole.groupId,
    brandId: userRole.brandId,
  }));

  const permissions = [
    ...new Set(userRoles.flatMap((userRole) => userRole.role.permissions.map((p) => p.code))),
  ];

  // Lets the Company Admin / Employee frontends decide whether to show
  // Brand pickers at all (rather than inferring it from an empty Brand
  // list, which can't distinguish "this company never uses Brands" from
  // "Super Admin hasn't added one yet"). Super Admin has no company of
  // their own (companyId null), so this is null for that portal.
  const company = companyId ? await db.Company.findByPk(companyId, { attributes: ['usesBrands'] }) : null;

  // Photo and designation live on the Employee record, not User (see the
  // employee module) — only resolvable for a caller whose account is
  // actually linked to one; most admin-only accounts have no employeeId and
  // simply get null for both, falling back to the generic avatar icon.
  // Name has a second source: users.name (set at invite time or self-service
  // via PATCH /auth/me/name) — an Employee's own name still wins whenever
  // both exist (see below), so this is really only ever read for admin-only
  // accounts, but defaulting to it up front means an Employee record with no
  // name of its own (e.g. Super Admin's minimal "name only" creation, which
  // ironically can leave it blank) still falls back sensibly.
  let name = user.name;
  let photoUrl = null;
  let designation = null;
  let rosterGroupId = null;
  // Whether this employee has been assigned a Comp-Off Policy — lets the
  // ESS "My Comp-Off" page show a not-enrolled state instead of an empty
  // credits table when they haven't (comp-off is opt-in, see
  // compOff.service.js::checkAndCreateCompOffCredit).
  let compOffEnrolled = false;
  if (user.employeeId) {
    const employee = await db.Employee.findByPk(user.employeeId, {
      attributes: ['name', 'photoUrl', 'rosterGroupId', 'compOffPolicyId'],
      include: [{ model: db.Designation, as: 'designation', attributes: ['title'] }],
    });
    if (employee) {
      name = employee.name || user.name;
      designation = employee.designation ? employee.designation.title : null;
      rosterGroupId = employee.rosterGroupId;
      compOffEnrolled = !!employee.compOffPolicyId;
      if (employee.photoUrl) {
        try {
          photoUrl = await getSignedDownloadUrl(employee.photoUrl);
        } catch (err) {
          console.error('Could not generate signed URL for profile photo:', err);
        }
      }
    }
  }

  // Admin-only accounts (no linked Employee — Super Admin, Group Admin,
  // Company Admin, Brand Admin, etc.) have their own photo on the User
  // record itself (see uploadMyUserPhoto below). An Employee's own photo
  // always wins when both somehow exist, matching the "photo lives on the
  // Employee record" precedent above.
  if (!photoUrl && user.photoUrl) {
    try {
      photoUrl = await getSignedDownloadUrl(user.photoUrl);
    } catch (err) {
      console.error('Could not generate signed URL for profile photo:', err);
    }
  }

  return {
    id: user.id,
    email: user.email,
    employeeId: user.employeeId,
    name,
    designation,
    roles,
    permissions,
    companyUsesBrands: company ? company.usesBrands : null,
    // Only ever set for an ESS caller (employeeId linked) — lets the
    // frontend filter its own "Company Policies" view to company-wide +
    // this employee's own Roster, without a separate lookup.
    rosterGroupId,
    compOffEnrolled,
    photoUrl,
    groupPowerCompanies,
    actingCompanyId: homeCompanyId ? companyId : null,
  };
}

// Looked up by email alone, same as login (email is only unique per
// company_id, not globally — see login's comment). Returns { user: null }
// for "no active account with this email" so the controller can still
// respond with the same generic message it uses on success — never letting
// a caller distinguish "no such account" from "reset email sent" (standard
// anti user-enumeration practice for forgot-password flows).
async function requestPasswordReset({ email }) {
  const user = await db.User.findOne({ where: { email } });
  if (!user || user.status !== 'active' || !user.isActive) {
    return { user: null, resetToken: null };
  }

  const rawToken = generateOpaqueToken();

  await db.sequelize.transaction(async (t) => {
    // Only the newest reset link should ever be valid — an older,
    // still-unexpired one from a previous request must not remain usable
    // once a new one is issued.
    await db.PasswordReset.update(
      { usedAt: new Date() },
      { where: { userId: user.id, usedAt: null }, transaction: t }
    );

    await db.PasswordReset.create(
      {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: minutesFromNow(PASSWORD_RESET_TTL_MINUTES),
      },
      { transaction: t }
    );
  });

  return { user, resetToken: rawToken };
}

async function resetPassword({ token, password }) {
  const reset = await db.PasswordReset.findOne({ where: { tokenHash: hashToken(token) } });
  if (!reset) throw new HttpError(400, 'Invalid or expired reset link');
  if (reset.usedAt) throw new HttpError(400, 'This reset link has already been used');
  if (reset.expiresAt < new Date()) throw new HttpError(400, 'This reset link has expired');

  const user = await db.User.findByPk(reset.userId);
  if (!user) throw new HttpError(404, 'User not found');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await db.sequelize.transaction(async (t) => {
    // Forgot-password is the higher-risk path (the request itself implies
    // the account owner may have lost control of their credentials), so
    // every other active session is force-logged-out here — unlike
    // changePassword below, which leaves existing sessions alone since the
    // caller already proved they know the current password. Bumping
    // tokenVersion instantly invalidates every refresh JWT issued before
    // this point, on every device, since refresh() rejects any token whose
    // embedded tokenVersion no longer matches.
    await user.update(
      { passwordHash, tokenVersion: user.tokenVersion + 1 },
      { transaction: t }
    );
    await reset.update({ usedAt: new Date() }, { transaction: t });
  });

  return { user };
}

async function changePassword({ userId, currentPassword, newPassword }) {
  const user = await db.User.findByPk(userId);
  if (!user || !user.passwordHash) throw new HttpError(404, 'User not found');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(400, 'Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await user.update({ passwordHash });

  return { user };
}

// Self-service profile photo for admin-only accounts (no linked Employee —
// see auth.controller.js, which blocks this for any caller who does have an
// employeeId, since that account manages its photo via the Employee record
// instead, per getCurrentUser's priority above). Same GCS pipeline and
// replace-wholesale-then-delete-previous pattern as
// employee.service.js::uploadEmployeePhoto/removeEmployeePhoto.
async function withUserPhotoUrl(user) {
  if (!user.photoUrl) return { id: user.id, photoUrl: null, photoDownloadUrl: null };
  try {
    return { id: user.id, photoUrl: user.photoUrl, photoDownloadUrl: await getSignedDownloadUrl(user.photoUrl) };
  } catch (err) {
    console.error('Could not generate signed URL for user photo:', err);
    return { id: user.id, photoUrl: user.photoUrl, photoDownloadUrl: null };
  }
}

// Self-service display name for an admin-only account — mirrors
// uploadMyUserPhoto/removeMyUserPhoto's shape exactly. The controller
// rejects this outright for a caller with a linked Employee (that name
// always comes from employees.name instead — see getCurrentUser), so this
// function itself doesn't need to re-check that.
async function updateMyName({ userId, name }) {
  const user = await db.User.findByPk(userId);
  if (!user) throw new HttpError(404, 'User not found');

  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new HttpError(400, 'name is required');

  await user.update({ name: trimmed });
  return { id: user.id, name: user.name };
}

async function uploadMyUserPhoto({ userId, buffer, originalName, mimeType }) {
  const user = await db.User.findByPk(userId);
  if (!user) throw new HttpError(404, 'User not found');

  if (user.photoUrl) {
    try {
      await deleteObject(user.photoUrl);
    } catch (err) {
      console.error('Could not delete previous user photo:', err);
    }
  }

  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destination = buildObjectPath({
    // Super Admin / Group Admin have no companyId of their own — 'platform'
    // keeps the bucket's per-tenant folder convention (see gcs.js) intact
    // instead of a literal "null" segment.
    companyId: user.companyId || 'platform',
    resource: 'user-photos',
    resourceId: user.id,
    fileName: `${crypto.randomUUID()}-${safeName}`,
  });
  await uploadBuffer({ buffer, destination, contentType: mimeType });

  await user.update({ photoUrl: destination });
  return withUserPhotoUrl(user);
}

async function removeMyUserPhoto({ userId }) {
  const user = await db.User.findByPk(userId);
  if (!user) throw new HttpError(404, 'User not found');

  if (user.photoUrl) {
    try {
      await deleteObject(user.photoUrl);
    } catch (err) {
      console.error('Could not delete user photo:', err);
    }
    await user.update({ photoUrl: null });
  }

  return withUserPhotoUrl(user);
}

module.exports = {
  inviteCompanyAdmin,
  inviteGroupAdmin,
  inviteBrandAdmin,
  inviteEmployeeUser,
  resendEmployeeInvite,
  transferEmployeeLogin,
  activateAccount,
  login,
  refresh,
  logout,
  getCurrentUser,
  updateMyName,
  requestPasswordReset,
  resetPassword,
  changePassword,
  uploadMyUserPhoto,
  removeMyUserPhoto,
};
