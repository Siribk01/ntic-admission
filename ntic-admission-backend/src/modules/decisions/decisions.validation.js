// src/modules/decisions/decisions.validation.js
const { z } = require('zod');
const { STATUS } = require('../../constants/applicationStatus');

const text = (label, min, max) =>
  z.string({ error: `${label} is required` }).trim().min(min, `${label} must be at least ${min} characters`).max(max, `${label} is too long`);

const requestInformationSchema = z.object({ message: text('Message', 5, 1000) }).strict();

const sendForDecisionSchema = z.object({ notes: text('Notes', 1, 1000).optional() }).strict();

const decisionSchema = z
  .object({
    outcome: z.enum(['offer', 'waitlist', 'reject'], { error: 'Outcome must be offer, waitlist or reject' }),
    reasonCode: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Reason code uses lowercase letters, numbers and underscores').optional(),
    notes: text('Notes', 1, 1000).optional(),                 // internal only
    publicMessage: text('Message', 1, 1000).optional(),       // the parent can read this
    offerDeadline: z.iso.date('Use the format YYYY-MM-DD').optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.outcome === 'offer') {
      if (!data.offerDeadline) {
        ctx.addIssue({ code: 'custom', path: ['offerDeadline'], message: 'An offer needs a response deadline' });
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const days = (Date.parse(data.offerDeadline) - Date.parse(today)) / 864e5;
        if (days < 1) ctx.addIssue({ code: 'custom', path: ['offerDeadline'], message: 'The deadline must be after today' });
        if (days > 120) ctx.addIssue({ code: 'custom', path: ['offerDeadline'], message: 'The deadline cannot be more than 120 days away' });
      }
    } else if (data.offerDeadline) {
      ctx.addIssue({ code: 'custom', path: ['offerDeadline'], message: 'Only an offer has a response deadline' });
    }
  });

const reopenSchema = z.object({ reason: text('Reason', 3, 500) }).strict();
const respondSchema = z.object({ message: text('Message', 1, 1000).optional() }).strict();
const withdrawSchema = z.object({ reason: text('Reason', 3, 500) }).strict();

const listSchema = z
  .object({
    status: z.enum(Object.values(STATUS), { error: 'Unknown status' }).optional(),
    cycleId: z.uuid('cycleId must be a valid id').optional(),
    campusId: z.uuid('campusId must be a valid id').optional(),
    q: z.string().trim().min(2, 'Search needs at least 2 characters').max(60).optional(),
    limit: z.coerce.number({ error: 'limit must be a number' }).int().min(1).max(100).default(25),
    offset: z.coerce.number({ error: 'offset must be a number' }).int().min(0).max(100000).default(0),
  })
  .strict();

module.exports = {
  requestInformationSchema, sendForDecisionSchema, decisionSchema, reopenSchema, respondSchema, withdrawSchema, listSchema,
};
