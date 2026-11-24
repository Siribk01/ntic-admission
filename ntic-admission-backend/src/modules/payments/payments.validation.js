// src/modules/payments/payments.validation.js
const { z } = require('zod');
const { toMinorUnits } = require('../../utils/money');

// Same rule as fee rules: 15000 or "15000.50", no commas, at most 2 decimals. Result is whole kobo.
const amountField = z
  .union([z.number(), z.string()], { error: 'Amount is required' })
  .transform((value) => String(value).trim())
  .pipe(z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, 'Amount must be a number with at most 2 decimal places (no commas or symbols)'))
  .transform(toMinorUnits)
  .pipe(z.number().int().positive('Amount must be greater than zero'));

const createPaymentSchema = z
  .object({
    // Staff may identify the application by the number on the parent's slip, or by id. Exactly one.
    applicationNumber: z.string().trim().regex(/^NTIC-\d{4}-\d{6}$/, 'Application number looks like NTIC-2026-001001').optional(),
    applicationId: z.uuid('applicationId must be a valid id').optional(),
    amount: amountField,
    method: z.enum(['cash', 'bank_transfer', 'pos', 'waiver'], { error: 'Method must be cash, bank_transfer, pos or waiver' }),
    bankReference: z.string().trim().min(3, 'Bank reference is too short').max(100, 'Bank reference is too long').optional(),
    paidAt: z.iso.datetime({ offset: true, error: 'paidAt must include a time zone, e.g. 2026-11-14T10:30:00+01:00' }).optional(),
    note: z.string().trim().min(1).max(300, 'Note is too long').optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.applicationNumber === !data.applicationId) {
      ctx.addIssue({ code: 'custom', path: ['applicationNumber'], message: 'Send either applicationNumber or applicationId, not both and not neither' });
    }
    if (!['cash', 'waiver'].includes(data.method) && !data.bankReference) {
      ctx.addIssue({ code: 'custom', path: ['bankReference'], message: 'A bank reference is required for bank transfers and POS payments' });
    }
    if (data.method === 'waiver') {
      if (!data.note || data.note.length < 10) ctx.addIssue({ code: 'custom', path: ['note'], message: 'A waiver needs a note explaining why (at least 10 characters)' });
      if (data.bankReference) ctx.addIssue({ code: 'custom', path: ['bankReference'], message: 'A waiver has no bank reference' });
    }
    if (data.paidAt && Date.parse(data.paidAt) > Date.now() + 5 * 60 * 1000) {
      ctx.addIssue({ code: 'custom', path: ['paidAt'], message: 'The payment time cannot be in the future' });
    }
  });

const reversePaymentSchema = z
  .object({ reason: z.string({ error: 'A reason is required' }).trim().min(3, 'Please give a reason (at least 3 characters)').max(500) })
  .strict();

const listPaymentsSchema = z
  .object({
    applicationId: z.uuid('applicationId must be a valid id').optional(),
    limit: z.coerce.number({ error: 'limit must be a number' }).int().min(1).max(200).default(50),
  })
  .strict();

module.exports = { createPaymentSchema, reversePaymentSchema, listPaymentsSchema, amountField };
