'use strict';

const dns = require('dns');
const nodemailer = require('nodemailer');

// Lazily created so a missing/misconfigured SMTP_* env var only breaks email
// sending (caught and logged by callers, same "best-effort" convention as
// comp-off auto-detection and custom power role sync elsewhere in this codebase),
// not server boot.
//
// Render (and some other containerized hosts) have no outbound IPv6 route,
// but nodemailer's own DNS resolution (lib/shared/index.js) decides IPv4
// vs IPv6 by inspecting *this machine's* network interfaces, not by an
// option we control — passing `family: 4` to createTransport does nothing;
// SMTPConnection.connect() never reads it. On Render that interface check
// comes back empty for IPv4, so nodemailer falls back to smtp.gmail.com's
// AAAA record and the connection fails with ENETUNREACH. Worked around by
// resolving the A record ourselves (dns.resolve4, unaffected by that
// interface-detection bug) and connecting to the literal IPv4 address —
// `tls.servername` is set explicitly so the Gmail certificate still
// validates against the real hostname despite connecting by IP.
let transporterPromise = null;
async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const host = process.env.SMTP_HOST;
      let connectHost = host;
      try {
        const addresses = await dns.promises.resolve4(host);
        if (addresses.length > 0) connectHost = addresses[0];
      } catch (err) {
        console.error(`[mailer] IPv4 resolution for ${host} failed, falling back to hostname:`, err.message);
      }

      return nodemailer.createTransport({
        host: connectHost,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          servername: host,
        },
      });
    })();
  }
  return transporterPromise;
}

// Best-effort startup check (called once from server.js, logged-not-thrown
// same as every other mailer failure) — confirms SMTP auth + connectivity
// actually work on this host at boot, instead of only finding out via a
// silently-swallowed failure the first time someone sends an invite.
async function verifyMailerConnection() {
  try {
    const t = await getTransporter();
    await t.verify();
    console.log('[mailer] SMTP connection verified OK');
  } catch (err) {
    console.error('[mailer] SMTP verification failed:', err.message);
  }
}

// Same FRONTEND_URL reuse as buildActivationUrl/buildPasswordResetUrl
// below — the frontend serves its own public/HRMS Logo.png at this path, so
// no separate asset hosting is needed for email clients to fetch it.
function buildLogoUrl() {
  const origin = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${origin}/HRMS%20Logo.png`;
}

// Wraps every outgoing email with the same logo header, so individual
// templates (activation, password reset, and any future one) don't each
// need to duplicate it.
async function sendMail({ to, subject, html, text }) {
  const fromName = process.env.MAIL_FROM_NAME || 'HRMS';
  const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER;

  const brandedHtml = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="text-align: center; padding: 16px 0 24px;">
        <img src="${buildLogoUrl()}" alt="${fromName}" style="height: 56px;" />
      </div>
      ${html}
    </div>
  `;

  const t = await getTransporter();
  await t.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html: brandedHtml,
    text,
  });
}

function buildActivationUrl(activationToken) {
  const origin = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${origin}/activate?token=${encodeURIComponent(activationToken)}`;
}

function buildPasswordResetUrl(resetToken) {
  const origin = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${origin}/reset-password?token=${encodeURIComponent(resetToken)}`;
}

async function sendActivationEmail({ to, activationToken }) {
  const activationUrl = buildActivationUrl(activationToken);

  await sendMail({
    to,
    subject: 'Activate your HRMS account',
    html: `
      <p>You've been invited to the HRMS platform.</p>
      <p><a href="${activationUrl}">Click here to activate your account</a> and set your password.</p>
      <p>If the link above doesn't work, copy and paste this URL into your browser:</p>
      <p>${activationUrl}</p>
    `,
    text: `You've been invited to the HRMS platform. Activate your account: ${activationUrl}`,
  });
}

// 10-minute expiry is stated explicitly in the email itself (not just
// enforced server-side in auth.service.js::requestPasswordReset) so the
// recipient isn't surprised by an "expired" error if they don't click right
// away.
async function sendPasswordResetEmail({ to, resetToken }) {
  const resetUrl = buildPasswordResetUrl(resetToken);

  await sendMail({
    to,
    subject: 'Reset your HRMS password',
    html: `
      <p>We received a request to reset your HRMS account password.</p>
      <p><a href="${resetUrl}">Click here to choose a new password</a>.</p>
      <p><strong>This link expires in 10 minutes</strong> and can only be used once.</p>
      <p>If the link above doesn't work, copy and paste this URL into your browser:</p>
      <p>${resetUrl}</p>
      <p>If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    `,
    text: `We received a request to reset your HRMS account password. This link expires in 10 minutes and can only be used once: ${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  });
}

module.exports = {
  sendMail,
  sendActivationEmail,
  sendPasswordResetEmail,
  buildActivationUrl,
  buildPasswordResetUrl,
  verifyMailerConnection,
};
