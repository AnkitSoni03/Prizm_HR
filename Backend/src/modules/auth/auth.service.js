'use strict';

const bcrypt = require('bcrypt');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runWithTenant } = require('../../config/tenant-context');
const { ensureCustomRoleGrant } = require('../../utils/customPowerSync');
const { getSignedDownloadUrl } = require('../../utils/gcs');
const { isCompanyInactive } = require('../../utils/companyStatus');
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
async function inviteCompanyAdmin({ companyId, email }) {
  const company = await db.Company.findByPk(companyId);
  if (!company) throw new HttpError(404, 'Company not found');

  const role = await db.Role.findOne({ where: { name: 'Company Admin', isSystem: true } });
  if (!role) throw new HttpError(500, 'Company Admin role is not seeded');

  const existing = await db.User.findOne({ where: { companyId, email } });
  if (existing) throw new HttpError(409, 'A user with this email already exists for this company');

  const rawToken = generateOpaqueToken();

  const { user, invitation } = await db.sequelize.transaction(async (t) => {
    const createdUser = await db.User.create(
      { companyId, email, status: 'invited', invitedAt: new Date() },
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

    return { user: createdUser, invitation: createdInvitation };
  });

  return { user, invitation, activationToken: rawToken };
}

// Mirrors inviteCompanyAdmin, but keyed on groupId instead of companyId.
// A Group's first admin is a platform-level user (company_id NULL), same as
// Super Admin, distinguished by group_id being set — see requireSuperAdmin
// in auth.middleware.js.
async function inviteGroupAdmin({ groupId, email }) {
  const group = await db.Group.findByPk(groupId);
  if (!group) throw new HttpError(404, 'Group not found');

  const role = await db.Role.findOne({ where: { name: 'Group Admin', isSystem: true } });
  if (!role) throw new HttpError(500, 'Group Admin role is not seeded');

  const existing = await db.User.findOne({ where: { groupId, email } });
  if (existing) throw new HttpError(409, 'A user with this email already exists for this group');

  const rawToken = generateOpaqueToken();

  const { user, invitation } = await db.sequelize.transaction(async (t) => {
    const createdUser = await db.User.create(
      { groupId, companyId: null, email, status: 'invited', invitedAt: new Date() },
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
async function inviteBrandAdmin({ brandId, email }) {
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
      { companyId, email, status: 'invited', invitedAt: new Date() },
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

    return { user: createdUser, invitation: createdInvitation };
  });

  return { user, invitation, activationToken: rawToken };
}

// Reassigns an existing ESS login to a new email — e.g. an employee wants to
// switch which inbox they use, without losing their identity/history (leave
// balances, approval history, notifications, etc. are all keyed off
// employees.id, not the User row, so none of that is touched). The old User
// row is never deleted (CLAUDE.md: soft deletes only, and audit trails like
// approval_histories.approver_user_id / notifications.user_id may still
// reference it) — just unlinked from this employee and deactivated so it can
// no longer log in, mirroring setEmployeeActiveStatus's cascade. A fresh
// invited User is then created for the new email, same invite+activate flow
// as inviteEmployeeUser, so the employee still has to prove they control the
// new inbox before they can log in with it.
async function transferEmployeeLogin({ companyId, employeeId, newEmail, brandId, scopedBrandIds }) {
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

  const existing = await db.User.findOne({ where: { companyId, email: newEmail } });
  if (existing) throw new HttpError(409, 'A user with this email already exists for this company');

  // Same tenant-scope-hook dodge as inviteEmployeeUser — see its comment.
  const role = await runWithTenant({ companyId: null }, () =>
    db.Role.findOne({ where: { name: 'Employee', isSystem: true } })
  );
  if (!role) throw new HttpError(500, 'Employee role is not seeded');

  const oldUserId = employee.userId;
  const rawToken = generateOpaqueToken();

  const { user, invitation } = await db.sequelize.transaction(async (t) => {
    const oldUser = await db.User.findByPk(oldUserId, { transaction: t });
    if (oldUser) {
      // The old inbox may have been compromised or simply abandoned —
      // invalidate every outstanding refresh token on it (tokenVersion
      // bump), same as resetPassword's "force logout everywhere" precedent.
      // isActive: false also blocks login/refresh outright regardless.
      await oldUser.update(
        { employeeId: null, isActive: false, tokenVersion: oldUser.tokenVersion + 1 },
        { transaction: t }
      );
    }

    const createdUser = await db.User.create(
      { companyId, email: newEmail, employeeId: employee.id, status: 'invited', invitedAt: new Date() },
      { transaction: t }
    );

    const createdInvitation = await db.Invitation.create(
      {
        companyId,
        email: newEmail,
        roleId: role.id,
        brandId: null,
        tokenHash: hashToken(rawToken),
        expiresAt: daysFromNow(INVITATION_TTL_DAYS),
      },
      { transaction: t }
    );

    await employee.update({ userId: createdUser.id }, { transaction: t });

    return { user: createdUser, invitation: createdInvitation };
  });

  return { user, invitation, activationToken: rawToken };
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

    await db.UserRole.create(
      {
        userId: user.id,
        roleId: invitation.roleId,
        companyId: invitation.companyId,
        groupId: invitation.groupId,
        brandId: invitation.brandId,
      },
      { transaction: t }
    );

    // Flips the Employee lifecycle status (distinct from the User login
    // status just set above) from 'onboarding' to 'active' the moment they
    // actually set their password — previously this only ever happened via
    // a manual edit in EmployeeDetailModal.tsx. Only touches an employee
    // still sitting in the default pre-activation 'onboarding' state, so it
    // never clobbers a deliberate later lifecycle change (e.g. an admin who
    // marked them 'on_notice'/'exited' before they got around to
    // activating their invite).
    if (user.employeeId) {
      const employee = await db.Employee.findByPk(user.employeeId, { transaction: t });
      if (employee && employee.status === 'onboarding') {
        await employee.update({ status: 'active' }, { transaction: t });
      }
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
  const user = await db.User.findOne({ where: { email } });
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
async function getCurrentUser({ userId, companyId }) {
  const user = await db.User.findByPk(userId, {
    attributes: ['id', 'email', 'employeeId'],
  });
  if (!user) throw new HttpError(404, 'User not found');

  const userRoles = await db.UserRole.findAll({
    where: { userId, companyId },
    include: [
      {
        model: db.Role,
        as: 'role',
        required: true,
        include: [{ model: db.Permission, as: 'permissions', attributes: ['code'] }],
      },
    ],
  });

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

  // Name and photo both live on the Employee record, not User (see the
  // employee module) — only resolvable for a caller whose account is
  // actually linked to one (ESS employees; most admin-only accounts have
  // no employeeId and simply get null for both, falling back to the raw
  // email / generic avatar icon on the frontend).
  let name = null;
  let photoUrl = null;
  if (user.employeeId) {
    const employee = await db.Employee.findByPk(user.employeeId, { attributes: ['name', 'photoUrl'] });
    if (employee) {
      name = employee.name;
      if (employee.photoUrl) {
        try {
          photoUrl = await getSignedDownloadUrl(employee.photoUrl);
        } catch (err) {
          console.error('Could not generate signed URL for profile photo:', err);
        }
      }
    }
  }

  return {
    id: user.id,
    email: user.email,
    employeeId: user.employeeId,
    name,
    roles,
    permissions,
    companyUsesBrands: company ? company.usesBrands : null,
    photoUrl,
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

module.exports = {
  inviteCompanyAdmin,
  inviteGroupAdmin,
  inviteBrandAdmin,
  inviteEmployeeUser,
  transferEmployeeLogin,
  activateAccount,
  login,
  refresh,
  logout,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  changePassword,
};
