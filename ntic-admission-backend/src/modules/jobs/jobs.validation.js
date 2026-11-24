// src/modules/jobs/jobs.validation.js
const { z } = require('zod');

const runSchema = z
  .object({
    job: z.enum(['reconcile_payments', 'expire_unpaid', 'expire_offers', 'send_reminders'], {
      error: 'job must be reconcile_payments, expire_unpaid, expire_offers or send_reminders',
    }).optional(),
  })
  .strict();

module.exports = { runSchema };
