// src/modules/account/account.validation.js
const { z } = require('zod');

const required = (label) => z.string({ error: `${label} is required` }).min(1, `${label} is required`);

// The token is a long random string. A cap stops anyone sending megabytes.
const tokenSchema = z.object({ token: required('Token').max(200, 'Token is not valid') }).strict();

const forgotPasswordSchema = z
  .object({ email: z.string({ error: 'Email is required' }).trim().max(254, 'Email is too long').pipe(z.email('Enter a valid email address')) })
  .strict();

// The password RULES (length, letter, number) are checked in the service with the shared policy, so they are the same
// everywhere. Here we only make sure a password was sent at all.
const resetPasswordSchema = z.object({ token: required('Token').max(200, 'Token is not valid'), password: required('Password') }).strict();
const changePasswordSchema = z.object({ currentPassword: required('Current password'), newPassword: required('New password') }).strict();

module.exports = { tokenSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema };
