'use strict';

const authService = require('./auth.service');
const { requireCompanyScope } = require('../../utils/resolveCompanyScope');
const { sendActivationEmail, sendPasswordResetEmail } = require('../../utils/mailer');

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

// Best-effort, logged-not-thrown — same convention as comp-off
// auto-detection/HR Team role sync elsewhere in this codebase. A bad SMTP
// config or transient send failure shouldn't fail the invite itself (the
// Invitation/User rows are already committed); the activationToken is still
// returned in the response outside production so the flow stays testable
// even if email delivery is broken.
async function trySendActivationEmail({ to, activationToken }) {
  try {
    await sendActivationEmail({ to, activationToken });
  } catch (err) {
    console.error('Activation email send failed:', err);
  }
}

async function trySendPasswordResetEmail({ to, resetToken }) {
  try {
    await sendPasswordResetEmail({ to, resetToken });
  } catch (err) {
    console.error('Password reset email send failed:', err);
  }
}

async function signupInvite(req, res, next) {
  try {
    const { companyId, email } = req.body;
    if (!companyId || !email) {
      return res.status(400).json({ error: 'companyId and email are required' });
    }

    const { user, invitation, activationToken } = await authService.inviteCompanyAdmin({
      companyId,
      email,
    });
    await trySendActivationEmail({ to: user.email, activationToken });

    const response = {
      user: { id: user.id, email: user.email, status: user.status },
      invitation: { id: invitation.id, expiresAt: invitation.expiresAt },
    };

    // Surface the raw token outside production too, as a fallback for local
    // testing when SMTP isn't reachable — never in production.
    if (!isProd()) {
      response.activationToken = activationToken;
    }

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

async function signupInviteGroup(req, res, next) {
  try {
    const { groupId, email } = req.body;
    if (!groupId || !email) {
      return res.status(400).json({ error: 'groupId and email are required' });
    }

    const { user, invitation, activationToken } = await authService.inviteGroupAdmin({
      groupId,
      email,
    });
    await trySendActivationEmail({ to: user.email, activationToken });

    const response = {
      user: { id: user.id, email: user.email, status: user.status },
      invitation: { id: invitation.id, expiresAt: invitation.expiresAt },
    };

    if (!isProd()) {
      response.activationToken = activationToken;
    }

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

async function signupInviteBrand(req, res, next) {
  try {
    const { brandId, email } = req.body;
    if (!brandId || !email) {
      return res.status(400).json({ error: 'brandId and email are required' });
    }

    const { user, invitation, activationToken } = await authService.inviteBrandAdmin({
      brandId,
      email,
    });
    await trySendActivationEmail({ to: user.email, activationToken });

    const response = {
      user: { id: user.id, email: user.email, status: user.status },
      invitation: { id: invitation.id, expiresAt: invitation.expiresAt },
    };

    if (!isProd()) {
      response.activationToken = activationToken;
    }

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

// Company Admin/HR-scoped, not Super-Admin-only (unlike signupInvite/
// signupInviteGroup) — a Company Admin's own `user:invite` permission
// legitimately covers inviting employees within their own company.
async function signupInviteEmployee(req, res, next) {
  try {
    const { employeeId, email, brandId } = req.body;
    if (!employeeId || !email) {
      return res.status(400).json({ error: 'employeeId and email are required' });
    }

    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const { user, invitation, activationToken } = await authService.inviteEmployeeUser({
      companyId,
      employeeId,
      email,
      brandId,
      // null = caller holds a company-wide user:invite grant; an array
      // means they only hold it for specific brand(s) — the target
      // employee's own brandId must be one of these regardless of what
      // (if anything) the client sent as brandId.
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    await trySendActivationEmail({ to: user.email, activationToken });

    const response = {
      user: { id: user.id, email: user.email, status: user.status },
      invitation: { id: invitation.id, expiresAt: invitation.expiresAt },
    };

    if (!isProd()) {
      response.activationToken = activationToken;
    }

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

async function activate(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'token and password are required' });
    }

    const { user } = await authService.activateAccount({ token, password });
    res.status(200).json({ user: { id: user.id, email: user.email, status: user.status } });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const tokens = await authService.login({ email, password });
    res.status(200).json(tokens);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    const tokens = await authService.refresh({ refreshToken });
    res.status(200).json(tokens);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    await authService.logout({ refreshToken });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const profile = await authService.getCurrentUser(req.auth);
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
}

// Always the same generic response whether or not the email matches an
// account — never lets a caller distinguish "no such account" from "reset
// email sent" (standard anti user-enumeration practice).
const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for this email, a password reset link has been sent. It expires in 10 minutes.';

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const { user, resetToken } = await authService.requestPasswordReset({ email });

    const response = { message: FORGOT_PASSWORD_MESSAGE };

    if (user && resetToken) {
      await trySendPasswordResetEmail({ to: user.email, resetToken });
      // Dev-only fallback for local testing when SMTP isn't reachable —
      // same convention as the activationToken exposed by the invite
      // endpoints. Never present in production, and never present at all
      // when no matching account was found (would otherwise leak existence).
      if (!isProd()) {
        response.resetToken = resetToken;
      }
    }

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'token and password are required' });
    }
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      return res.status(400).json({ error: strengthError });
    }

    const { user } = await authService.resetPassword({ token, password });
    res.status(200).json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return res.status(400).json({ error: strengthError });
    }

    await authService.changePassword({
      userId: req.auth.userId,
      currentPassword,
      newPassword,
    });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  signupInvite,
  signupInviteGroup,
  signupInviteBrand,
  signupInviteEmployee,
  activate,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
};
