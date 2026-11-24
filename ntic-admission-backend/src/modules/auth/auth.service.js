// src/modules/auth/auth.service.js
// Business rules for sign-up and login.

const usersRepo = require('../users/users.repository');
const auditService = require('../audit/audit.service');
const { hashPassword, verifyPassword } = require('../../utils/password');
const { validate } = require('../../utils/validate');
const { signAccessToken } = require('../../utils/tokens');
const AppError = require('../../utils/AppError');
const { registerSchema, loginSchema } = require('./auth.validation');

const MAX_FAILED_LOGINS = 5; // wrong passwords allowed in a row...
const LOCK_MINUTES = 15;     // ...before the account is locked for this long
const GENERIC_LOGIN_ERROR = 'Invalid email or password';
const accountService = require('../account/account.service');

// A real hash of a throwaway password. Used so that "no such email" takes as long as "wrong password".
const dummyHashPromise = hashPassword('timing-equaliser-not-a-real-password');

// context = { ip, userAgent } from the request, used only for the audit log
async function registerApplicant(input, context = {}) {
  const data = validate(registerSchema, input);
  const passwordHash = await hashPassword(data.password);

  let user;
  try {
    user = await usersRepo.createUser({
      email: data.email,
      phone: data.phone ?? null,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'applicant',
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'users_email_uq') {
      throw AppError.conflict('An account with this email already exists');
    }
    throw err;
  }

  await auditService.recordSafely({
    actor: user,
    action: 'auth.register',
    resourceType: 'user',
    resourceId: user.id,
    ...context,
  });

  return user;
}

async function login(input, context = {}) {
  const { email, password } = validate(loginSchema, input);

  // Small helper so each failure below is one readable line
  const logFailure = (reason, user = null) =>
    auditService.recordSafely({
      actor: user,
      actorEmail: email,
      action: 'auth.login',
      outcome: 'failure',
      resourceType: user ? 'user' : null,
      resourceId: user ? user.id : null,
      metadata: { reason },
      ...context,
    });

  const user = await usersRepo.findAuthByEmail(email);

  // 1. Unknown email: do the same slow hash work anyway, then give the same answer as a wrong password
  if (!user) {
    await verifyPassword(password, await dummyHashPromise);
    await logFailure('unknown_email');
    throw AppError.unauthorized(GENERIC_LOGIN_ERROR);
  }

  // 2. Locked account: refuse without even checking the password (so guessing during a lock is pointless)
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    await logFailure('account_locked', user);
    const minutes = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
    throw AppError.tooManyRequests(
      `Too many failed sign-in attempts. Try again in ${minutes} minute(s).`,
      'ACCOUNT_LOCKED'
    );
  }

  // 3. Wrong password: count it (this may lock the account) and give the generic answer
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    const result = await usersRepo.recordFailedLogin(user.id, {
      maxAttempts: MAX_FAILED_LOGINS,
      lockMinutes: LOCK_MINUTES,
    });
    await logFailure('wrong_password', user);

    // We already know the account was not locked a moment ago, so a lock date now means THIS attempt locked it
    if (result.lockedUntil && new Date(result.lockedUntil) > new Date()) {
        await auditService.recordSafely({
    actor: user,
    action: 'auth.register',
    resourceType: 'user',
    resourceId: user.id,
    ...context,
  });

  // Send the "confirm your email" message. A failure here must never stop the sign-up itself.
  accountService.sendVerificationEmail(user.id).catch((err) =>
    console.error('Could not queue the verification email:', err.message)
  );

  return user;
    }
    throw AppError.unauthorized(GENERIC_LOGIN_ERROR);
  }

  // 4. Right password, but the account was switched off by an administrator
  if (!user.isActive) {
    await logFailure('account_deactivated', user);
    throw AppError.forbidden('This account has been deactivated. Please contact NTIC.');
  }

  // 5. Success
  await usersRepo.recordSuccessfulLogin(user.id);
  await auditService.recordSafely({
    actor: user,
    action: 'auth.login',
    resourceType: 'user',
    resourceId: user.id,
    ...context,
  });


  const { token, expiresInSeconds } = signAccessToken(user.id);

  // Remove the hash and lockout fields before the user object leaves this function
  const { passwordHash, failedLoginCount, lockedUntil, ...safeUser } = user;

  return {
    accessToken: token,
    tokenType: 'Bearer',
    expiresIn: expiresInSeconds,
    user: safeUser,
  };
}

module.exports = { registerApplicant, login };