// src/modules/settings/settings.validation.js
const { z } = require('zod');
const { DEFINITIONS, KEYS } = require('./settings.definitions');

// A whole number inside the setting's limits. Only the "not a number" message is replaced, so range messages stay precise.
const numberError = (label) => (issue) => (issue.code === 'invalid_type' ? `${label} must be a number` : undefined);

const shape = {};
for (const key of KEYS) {
  const d = DEFINITIONS[key];
  shape[d.api] = d.type === 'boolean'
    ? z.boolean({ error: `${d.api} must be true or false` }).optional()
    : z
        .number({ error: numberError(d.api) })
        .int(`${d.api} must be a whole number`)
        .min(d.min, `${d.api} must be at least ${d.min}`)
        .max(d.max, `${d.api} cannot be more than ${d.max}`)
        .optional();
}

const updateSettingsSchema = z
  .object(shape)
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Send at least one setting to change' });

module.exports = { updateSettingsSchema };
