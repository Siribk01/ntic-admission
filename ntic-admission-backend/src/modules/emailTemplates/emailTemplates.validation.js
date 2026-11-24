// src/modules/emailTemplates/emailTemplates.validation.js
const { z } = require('zod');
const { KEYS, check } = require('./emailTemplates.definitions');
const { clean } = require('../printables/printables.templates');

const keySchema = z.enum(KEYS, { error: `Email must be one of: ${KEYS.join(', ')}` });

const text = (label, max) =>
  z.string({ error: `${label} must be text` }).transform(clean).pipe(z.string().trim().min(1, `${label} cannot be empty`).max(max, `${label} is too long (at most ${max} characters)`));

const draft = z.object({
  subject: text('Subject', 150).refine((s) => !s.includes('\n'), 'The subject must be one line'),
  body: text('Body', 4000),
}).strict();

const withChecks = (schema, key) =>
  schema.superRefine((d, ctx) => {
    for (const p of check(key, d)) ctx.addIssue({ code: 'custom', path: [p.field], message: p.message });
  });

const saveSchema = (key) =>
  withChecks(
    draft.extend({
      enabled: z.boolean({ error: 'enabled must be true or false' }),
      version: z.number({ error: 'version is required (0 when no custom wording exists yet, otherwise the version you are editing)' }).int().min(0),
    }).strict(),
    key
  );
const previewSchema = (key) => withChecks(draft, key);

module.exports = { keySchema, saveSchema, previewSchema };
