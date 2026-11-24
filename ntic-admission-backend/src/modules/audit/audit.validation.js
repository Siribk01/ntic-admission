// src/modules/audit/audit.validation.js

const { z } = require('zod');

// Query-string values always arrive as text, so numbers are converted (coerced)
const listAuditLogsSchema = z
  .object({
    action: z.string().trim().min(1).max(100).optional(),
    actorUserId: z.uuid('actorUserId must be a valid id').optional(),
    beforeId: z.string().regex(/^\d{1,18}$/, 'beforeId must be a whole number').optional(),
    limit: z.coerce
      .number({ error: 'limit must be a number' })
      .int('limit must be a whole number')
      .min(1, 'limit must be at least 1')
      .max(200, 'limit cannot be more than 200')
      .default(50),
  })
  .strict();

module.exports = { listAuditLogsSchema };