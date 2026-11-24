// src/modules/auth/auth.validation.js
// Describes exactly what the register request body must look like.

const { z } = require('zod');
const { checkPasswordPolicy } = require('../../utils/password');

// An empty text box in a form arrives as "" - treat that as "not provided"
const emptyToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const name = (label) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} is too long (maximum 80 characters)`);

const registerSchema = z
  .object({
    email: z
      .string({ error: 'Email is required' })
      .trim()
      .toLowerCase()
      .max(254, 'Email is too long')
      .pipe(z.email('Enter a valid email address')),

    password: z
      .string({ error: 'Password is required' })
      .superRefine((value, ctx) => {
        for (const problem of checkPasswordPolicy(value)) {
          ctx.addIssue({ code: 'custom', message: problem });
        }
      }),

    firstName: name('First name'),
    lastName: name('Last name'),

    phone: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number (digits only, optional + at the start)')
        .optional()
    ),
  })
  .strict(); // reject any field we did not list (blocks tricks like sending "role")

// Login only checks that both values are present. It does NOT apply the password policy,
// because someone with an older password must still be able to sign in.
const loginSchema = z
  .object({
    email: z
      .string({ error: 'Email is required' })
      .trim()
      .toLowerCase()
      .min(1, 'Email is required')
      .max(254, 'Email is too long'),
    password: z
      .string({ error: 'Password is required' })
      .min(1, 'Password is required')
      .max(200, 'Password is too long'),
  })
  .strict();

module.exports = { registerSchema, loginSchema };