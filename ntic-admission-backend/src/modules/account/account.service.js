// src/modules/account/account.service.js
// Email verification, forgotten passwords, and changing a password.
//
// How the one-time links work:
//   1. We make a long random token and email it inside a link.
//   2. We store only its SHA-256 hash. Nobody who reads the database can use it.
//   3. When the link is opened, we hash what was sent and look that up. A token works once, expires, and a newer
//      link cancels older ones.

const crypto = require('crypto');
const repo = require('./account.repository');
const notifications = require('../notifications/notifications.service');
const auditService = require('../audit/audit.service');
const { checkPasswordPolicy, hashPassword, verifyPassword } = require('../../utils/password');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const { tokenSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } = require('./account.validation');

const VERIFY_TTL_MINUTES = 24 * 60; // a verification link works for 24 hours
const RESET_TTL_MINUTES = 60;       // a password-reset link works for 1 hour: it is the more dangerous one
const MAX_LINKS_PER_HOUR = 3;
const MIN_SECONDS_BETWEEN_LINKS = 60;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url'); // 256 bits of randomness

// Where the link points: the front-end page that will read ?token=... and call this API
function linkFor(page, token) {
  const base = process.env.PORTAL_URL;
  return base ? `${base.replace(/\/+$/, '')}/${page}?token=${token}` : null;
}

const auditEvent = (user, action, context = {}, metadata) => ({
  actor: { id: user.id, role: user.role }, action, resourceType: 'user', resourceId: user.id,
  ip: context.ip, userAgent: context.userAgent, metadata,
});

const invalidLink = () => new AppError('This link is not valid or has expired. Please request a new one.', 400, 'INVALID_TOKEN');

async function passwordProblems(password, field) {
  const problems = checkPasswordPolicy(password);
  if (problems.length) throw AppError.validation(problems.map((message) => ({ field, message })));
}

// Is this user allowed another link right now?
async function mayRequestLink(userId, purpose) {
  const activity = await repo.recentTokenActivity(userId, purpose);
  return activity.lastHour < MAX_LINKS_PER_HOUR && activity.secondsSinceLast >= MIN_SECONDS_BETWEEN_LINKS;
}

// Makes a token, closes older ones, and queues the email. Runs in the caller's transaction.
async function issueLink(client, { user, purpose, ttlMinutes, page, template }) {
  const token = newToken();
  await repo.closeOpenTokens(user.id, purpose, client);
  await repo.insertToken({ userId: user.id, purpose, tokenHash: sha256(token), email: user.email, ttlMinutes }, client);
  await notifications.queueForUser(client, user.id, template, { link: linkFor(page, token), token });
}

// ===================== email verification =====================

// Returns 'sent', 'already_verified' or 'throttled'. Used by the resend endpoint, and by registration (see the install notes).
async function sendVerificationEmail(userId) {
  const user = await repo.findUserById(userId);
  if (!user || !user.isActive) throw AppError.notFound('Account not found');
  if (user.emailVerifiedAt) return 'already_verified';
  if (!(await mayRequestLink(user.id, 'verify_email'))) return 'throttled';
  await withTransaction((client) =>
    issueLink(client, { user, purpose: 'verify_email', ttlMinutes: VERIFY_TTL_MINUTES, page: 'verify-email', template: 'verify_email' })
  );
  return 'sent';
}

async function resendVerification(userId) {
  const result = await sendVerificationEmail(userId);
  if (result === 'throttled') {
    throw new AppError(
      `Please wait a minute before asking for another email. You can ask for up to ${MAX_LINKS_PER_HOUR} per hour.`, 429, 'TOO_MANY_REQUESTS');
  }
  return result === 'already_verified' ? { alreadyVerified: true } : { sent: true };
}

async function verifyEmail(input, context) {
  const { token } = validate(tokenSchema, input);
  await withTransaction(async (client) => {
    const row = await repo.lockToken(sha256(token), 'verify_email', client);
    // One message for every kind of failure, so the endpoint cannot be used to probe tokens
    if (!row || !row.usable || !row.isActive || row.tokenEmail.toLowerCase() !== row.currentEmail.toLowerCase()) throw invalidLink();
    await repo.markTokenUsed(row.id, client);
    await repo.markEmailVerified(row.userId, client);
    await auditService.record(auditEvent({ id: row.userId, role: row.role }, 'account.email_verified', context), { client });
  });
  return { verified: true };
}

async function getEmailStatus(userId) {
  const user = await repo.findUserById(userId);
  if (!user) throw AppError.notFound('Account not found');
  return { email: user.email, verified: Boolean(user.emailVerifiedAt), verifiedAt: user.emailVerifiedAt };
}

// ===================== forgotten password =====================

const FORGOT_REPLY = { message: 'If an account exists for that email address, we have sent instructions to reset the password.' };

// The answer is always the same, whether or not the email has an account, so this cannot be used to find out who is registered.
async function forgotPassword(input, context) {
  const { email } = validate(forgotPasswordSchema, input);
  const user = await repo.findUserByEmail(email);
  if (!user || !user.isActive) return FORGOT_REPLY;
  if (!(await mayRequestLink(user.id, 'reset_password'))) return FORGOT_REPLY; // quietly: do not let anyone flood a person's inbox

  await withTransaction(async (client) => {
    await issueLink(client, { user, purpose: 'reset_password', ttlMinutes: RESET_TTL_MINUTES, page: 'reset-password', template: 'password_reset' });
    await auditService.record(auditEvent(user, 'account.password_reset_requested', context), { client });
  });
  return FORGOT_REPLY;
}

async function resetPassword(input, context) {
  const { token, password } = validate(resetPasswordSchema, input);
  await passwordProblems(password, 'password'); // BEFORE using the token, so a too-weak password does not waste the link
  const passwordHash = await hashPassword(password); // slow on purpose, so done before the transaction

  await withTransaction(async (client) => {
    const row = await repo.lockToken(sha256(token), 'reset_password', client);
    if (!row || !row.usable || !row.isActive) throw invalidLink();
    await repo.markTokenUsed(row.id, client);
    await repo.closeOpenTokens(row.userId, 'reset_password', client);
    await repo.setPassword(row.userId, passwordHash, client);
    // Receiving this email proves the person controls the address, so it counts as verified
    if (row.tokenEmail.toLowerCase() === row.currentEmail.toLowerCase()) await repo.markEmailVerified(row.userId, client);
    await notifications.queueForUser(client, row.userId, 'password_changed');
    await auditService.record(auditEvent({ id: row.userId, role: row.role }, 'account.password_reset', context), { client });
  });
  return { reset: true };
}

// ===================== change password (signed in) =====================

async function changePassword(userId, input, context) {
  const { currentPassword, newPassword } = validate(changePasswordSchema, input);
  await passwordProblems(newPassword, 'newPassword');
  if (currentPassword === newPassword) {
    throw AppError.validation([{ field: 'newPassword', message: 'The new password must be different from the current one' }]);
  }

  const newHash = await hashPassword(newPassword);
  let outcome = 'ok';
  await withTransaction(async (client) => {
    const user = await repo.findForPasswordCheck(userId, client);
    if (!user) throw AppError.notFound('Account not found');
    if (user.locked) { outcome = 'locked'; return; }
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      outcome = (await repo.registerWrongPassword(userId, client)) ? 'locked' : 'wrong'; // this count must be saved, so no throw here
      return;
    }
    await repo.setPassword(userId, newHash, client);
    await notifications.queueForUser(client, userId, 'password_changed');
    await auditService.record(auditEvent(user, 'account.password_changed', context), { client });
  });

  if (outcome === 'locked') throw new AppError('Too many wrong passwords. Try again in 15 minutes.', 429, 'ACCOUNT_LOCKED');
  if (outcome === 'wrong') throw new AppError('The current password is not correct', 400, 'CURRENT_PASSWORD_INCORRECT');
  return { changed: true };
}

module.exports = {
  sendVerificationEmail, resendVerification, verifyEmail, getEmailStatus, forgotPassword, resetPassword, changePassword,
};
