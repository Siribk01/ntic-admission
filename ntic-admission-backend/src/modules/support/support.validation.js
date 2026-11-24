// src/modules/support/support.validation.js
const { z } = require('zod');

const CATEGORIES = ['payment', 'exam', 'documents', 'technical', 'other'];
const body = z.string({ error: 'message must be text' }).transform((v) => v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
  .pipe(z.string().min(2, 'Write a message').max(2000, 'The message is too long (at most 2000 characters)'));

const createSchema = z.object({
  category: z.enum(CATEGORIES, { error: `category must be one of: ${CATEGORIES.join(', ')}` }),
  subject: z.string({ error: 'subject is required' }).trim().min(3, 'The subject is too short').max(120, 'The subject is too long (at most 120 characters)').refine((s) => !/[\r\n]/.test(s), 'The subject must be one line'),
  message: body,
  applicationId: z.uuid('applicationId must be a valid id').optional(),
}).strict();
const replySchema = z.object({ body }).strict();
const listSchema = z.object({
  status: z.enum(['open', 'answered', 'closed'], { error: 'Status must be open, answered or closed' }).default('open'),
  limit: z.coerce.number({ error: 'limit must be a number' }).int().min(1).max(100).default(50),
}).strict();

module.exports = { CATEGORIES, createSchema, replySchema, listSchema };
