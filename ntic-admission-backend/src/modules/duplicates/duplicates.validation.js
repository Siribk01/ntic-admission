// src/modules/duplicates/duplicates.validation.js
const { z } = require('zod');

const listSchema = z.object({
  cycleId: z.uuid('cycleId must be a valid id').optional(),
  includeDismissed: z.enum(['true', 'false'], { error: 'includeDismissed must be true or false' }).optional(),
}).strict();

const key = z.string({ error: 'key is required' }).regex(/^[0-9a-f]{40}$/, 'key is not valid. Copy it from the list');
const dismissSchema = z.object({
  cycleId: z.uuid('cycleId must be a valid id').optional(),
  key,
  note: z.string({ error: 'A note is required' }).trim().min(3, 'Please say why these are not duplicates (at least 3 characters)').max(300, 'Note is too long'),
}).strict();
const restoreSchema = z.object({ cycleId: z.uuid('cycleId must be a valid id').optional(), key }).strict();

module.exports = { listSchema, dismissSchema, restoreSchema };
