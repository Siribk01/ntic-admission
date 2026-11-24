// src/modules/printables/printables.validation.js
const { z } = require('zod');
const { checkPlaceholders, clean } = require('./printables.templates');

const KEYS = ['letterhead', 'exam_instructions', 'offer_letter'];
const keySchema = z.enum(KEYS, { error: `Template must be one of: ${KEYS.join(', ')}` });

const text = (label, max) => z.string({ error: `${label} must be text` }).transform(clean).pipe(z.string().trim().min(1, `${label} cannot be empty`).max(max, `${label} is too long (at most ${max} characters)`));

const fields = z.object({
  title: text('Title', 120).optional(),
  body: text('Body', 6000),
  signatoryName: text('Signatory name', 120).nullable().optional(),
  signatoryTitle: text('Signatory title', 120).nullable().optional(),
}).strict();

// Rules that depend on WHICH template it is
function checkFor(key, data, ctx) {
  const add = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  for (const problem of checkPlaceholders(key, data.body)) add('body', problem);
  if (data.title) for (const problem of checkPlaceholders(key, data.title)) add('title', problem);
  if (key !== 'offer_letter') {
    if (data.title !== undefined) add('title', 'Only the offer letter has a title');
    if (data.signatoryName != null || data.signatoryTitle != null) add('signatoryName', 'Only the offer letter has a signatory');
  } else if (!data.title) add('title', 'The offer letter needs a title');
  if (key === 'letterhead' && data.body.split('\n').filter((l) => l.trim()).length > 6) add('body', 'The letterhead can have at most 6 lines');
  if (key === 'exam_instructions' && data.body.split('\n').filter((l) => l.trim()).length > 15) add('body', 'At most 15 instructions');
}

const saveSchema = (key) => fields.extend({ version: z.number({ error: 'version is required (the version you are editing)' }).int().min(1) }).strict().superRefine((d, ctx) => checkFor(key, d, ctx));
const previewSchema = (key) => fields.superRefine((d, ctx) => checkFor(key, d, ctx));

module.exports = { keySchema, saveSchema, previewSchema, KEYS };
