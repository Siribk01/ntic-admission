// src/modules/onlinePayments/onlinePayments.validation.js
const { z } = require('zod');
const { amountField } = require('../payments/payments.validation');

const initiateSchema = z.object({ amount: amountField.optional() }).strict();

// A calendar date typed by the parent: the day the transfer was made
const dateOnly = z.string({ error: 'paidOn is required' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'paidOn must be a date like 2026-11-14').refine((d) => !Number.isNaN(Date.parse(`${d}T12:00:00+01:00`)), 'paidOn is not a real date');

const claimSchema = z
  .object({
    amount: amountField,
    bankReference: z.string({ error: 'The bank reference is required' }).trim().min(3, 'Bank reference is too short').max(100, 'Bank reference is too long'),
    bankName: z.string().trim().min(2).max(80, 'Bank name is too long').optional(),
    paidOn: dateOnly,
    note: z.string().trim().min(1).max(300, 'Note is too long').optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const lagosToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
    if (d.paidOn > lagosToday) ctx.addIssue({ code: 'custom', path: ['paidOn'], message: 'The payment date cannot be in the future' });
    if (Date.parse(`${d.paidOn}T12:00:00+01:00`) < Date.now() - 90 * 864e5) ctx.addIssue({ code: 'custom', path: ['paidOn'], message: 'The payment date is more than 90 days ago. Please contact the school' });
  });

const rejectClaimSchema = z.object({ reason: z.string({ error: 'A reason is required' }).trim().min(3, 'Please give a reason (at least 3 characters)').max(300) }).strict();

const count = z.string().regex(/^\d+$/, 'Must be a whole number');
const listAttemptsSchema = z
  .object({ status: z.enum(['initiated', 'successful', 'failed', 'abandoned', 'needs_review']).optional(), limit: count.optional() })
  .strict();
const listClaimsSchema = z
  .object({ status: z.enum(['pending', 'confirmed', 'rejected']).optional(), limit: count.optional() })
  .strict();

const simulateSchema = z
  .object({
    reference: z.string().min(5).max(100).optional(),
    broken: z.boolean().optional(), // pretend the gateway is down (true) or back up (false)
    outcome: z.enum(['success', 'failed']).default('success'),
    amountMinor: z.number().int().positive().optional(),
    currency: z.string().min(3).max(3).optional(),
    webhook: z.boolean().optional(),
  })
  .strict()
  .refine((d) => d.reference || d.broken !== undefined, { message: 'Send a reference, or broken: true/false' });

module.exports = { initiateSchema, claimSchema, rejectClaimSchema, listAttemptsSchema, listClaimsSchema, simulateSchema };
