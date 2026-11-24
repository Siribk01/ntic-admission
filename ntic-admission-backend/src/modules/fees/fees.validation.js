// src/modules/fees/fees.validation.js

const { z } = require('zod');
const { toMinorUnits } = require('../../utils/money');

// Accepts 15000, "15000", 15000.5 or "15000.50". Rejects 0, negatives, "15,000", and more than 2 decimals.
// The result is a whole number of kobo.
const amountField = z
  .union([z.number(), z.string()], { error: 'Amount is required' })
  .transform((value) => String(value).trim())
  .pipe(
    z.string().regex(
      /^\d{1,8}(\.\d{1,2})?$/,
      'Amount must be a number with at most 2 decimal places (no commas or symbols)'
    )
  )
  .transform(toMinorUnits)
  .pipe(z.number().int().positive('Amount must be greater than zero'));

const dateField = (label) =>
  z.iso.date({ error: `${label} must be a date like 2027-01-31` });

const uuidField = (label) => z.uuid(`${label} must be a valid id`);

const createFeeRuleSchema = z
  .object({
    categoryId: uuidField('categoryId'),
    // Scope: send campusId (one campus), or stateId (every campus in a state), or neither (all campuses)
    campusId: uuidField('campusId').optional(),
    stateId: uuidField('stateId').optional(),
    amount: amountField,
    effectiveFrom: dateField('effectiveFrom'),
    effectiveTo: dateField('effectiveTo').optional(),
    notes: z.string().trim().max(500, 'Notes are too long (maximum 500 characters)').optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.campusId && data.stateId) {
      ctx.addIssue({
        code: 'custom',
        path: ['stateId'],
        message: 'Send either campusId or stateId, not both (a campus already belongs to one state)',
      });
    }
    if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
      ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'effectiveTo cannot be before effectiveFrom' });
    }
  });

// The price of a rule is never edited. To change a price: end the old rule and create a new one.
// Only its end date and its on/off switch can change, and always with a reason.
const updateFeeRuleSchema = z
  .object({
    effectiveTo: dateField('effectiveTo').nullable().optional(),
    active: z.boolean({ error: 'active must be true or false' }).optional(),
    reason: z
      .string({ error: 'A reason is required' })
      .trim()
      .min(3, 'Please give a reason (at least 3 characters)')
      .max(500, 'Reason is too long (maximum 500 characters)'),
  })
  .strict();

const quoteQuerySchema = z
  .object({
    campusId: uuidField('campusId'),
    categoryId: uuidField('categoryId'),
  })
  .strict();

const listFeeRulesQuerySchema = z
  .object({
    categoryId: uuidField('categoryId').optional(),
    campusId: uuidField('campusId').optional(),
    stateId: uuidField('stateId').optional(),
    active: z
      .enum(['true', 'false'], { error: 'active must be true or false' })
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

module.exports = {
  createFeeRuleSchema,
  updateFeeRuleSchema,
  quoteQuerySchema,
  listFeeRulesQuerySchema,
};