// src/modules/documents/documentTypes.admin.validation.js
const { z } = require('zod');

const MIMES = ['image/jpeg', 'image/png', 'application/pdf'];
const MIN_BYTES = 10 * 1024;
const MAX_BYTES = 5 * 1024 * 1024;

const mimes = z.array(z.enum(MIMES, { error: `Allowed file types are: ${MIMES.join(', ')}` }), { error: 'allowedMimes must be a list' })
  .min(1, 'Allow at least one file type').max(3).refine((a) => new Set(a).size === a.length, 'Each file type can be listed once');
const bytes = z.number({ error: 'maxBytes must be a number' }).int('maxBytes must be a whole number')
  .min(MIN_BYTES, `maxBytes must be at least ${MIN_BYTES} (10 KB)`).max(MAX_BYTES, `maxBytes cannot be more than ${MAX_BYTES} (5 MB)`);
const name = z.string({ error: 'name is required' }).trim().min(2, 'Name is too short').max(80, 'Name is too long');
const sortOrder = z.number({ error: 'sortOrder must be a number' }).int().min(1).max(999);

const createSchema = z.object({
  code: z.string({ error: 'code is required' }).regex(/^[a-z][a-z0-9_]{1,40}$/, 'code must be lowercase letters, digits and underscores, starting with a letter (for example medical_report)'),
  name,
  required: z.boolean().default(false),
  allowedMimes: mimes,
  maxBytes: bytes,
  sortOrder: sortOrder.optional(),
}).strict();

// Everything optional, but at least one thing must be sent. The code can never be changed: uploads and the forms refer to it.
const updateSchema = z.object({
  name: name.optional(),
  required: z.boolean().optional(),
  allowedMimes: mimes.optional(),
  maxBytes: bytes.optional(),
  sortOrder: sortOrder.optional(),
  isActive: z.boolean().optional(),
}).strict().refine((d) => Object.keys(d).length > 0, 'Send at least one field to change');

module.exports = { createSchema, updateSchema };
