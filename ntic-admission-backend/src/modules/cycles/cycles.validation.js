// src/modules/cycles/cycles.validation.js

const { z } = require('zod');

// An ISO date-time that INCLUDES a time zone, for example 2026-11-01T00:00:00+01:00 or ...Z.
// Without a zone the server could not know which clock "midnight" refers to.
const dateTime = (label) =>
  z.iso.datetime({
    offset: true,
    error: `${label} must be a date and time with a time zone, e.g. 2026-11-01T00:00:00+01:00`,
  });

const nameField = z
  .string({ error: 'Name is required' })
  .trim()
  .min(3, 'Name must be at least 3 characters')
  .max(120, 'Name is too long (maximum 120 characters)');

const sessionField = z
  .string({ error: 'Academic session is required' })
  .trim()
  .regex(/^\d{4}\/\d{4}$/, 'Academic session must look like 2026/2027');

const categoryItem = z
  .object({
    categoryId: z.uuid('Each categoryId must be a valid id'),
    interviewRequired: z.boolean().optional(),
  })
  .strict();

// Shared by create and update: no category may be listed twice
function checkNoDuplicateCategories(data, ctx) {
  if (!data.categories) return;
  const ids = data.categories.map((c) => c.categoryId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['categories'], message: 'Each category can only be listed once' });
  }
}

const createCycleSchema = z
  .object({
    name: nameField,
    academicSession: sessionField,
    opensAt: dateTime('Opening time'),
    closesAt: dateTime('Closing time'),
    categories: z
      .array(categoryItem, { error: 'Categories are required' })
      .min(1, 'Choose at least one category'),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (Date.parse(data.closesAt) <= Date.parse(data.opensAt)) {
      ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'Closing time must be after the opening time' });
    }
    checkNoDuplicateCategories(data, ctx);
  });

// Every field is optional: send only what should change. "categories" REPLACES the whole list.
const updateCycleSchema = z
  .object({
    name: nameField.optional(),
    academicSession: sessionField.optional(),
    opensAt: dateTime('Opening time').optional(),
    closesAt: dateTime('Closing time').optional(),
    categories: z
      .array(categoryItem, { error: 'Categories must be a list' })
      .min(1, 'Choose at least one category')
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.opensAt && data.closesAt && Date.parse(data.closesAt) <= Date.parse(data.opensAt)) {
      ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'Closing time must be after the opening time' });
    }
    checkNoDuplicateCategories(data, ctx);
  });

// Activating needs no information
const activateCycleSchema = z.object({}).strict();

const closeCycleSchema = z
  .object({
    reason: z.string().trim().max(500, 'Reason is too long (maximum 500 characters)').optional(),
  })
  .strict();

// Reopening must be explained, and may set a new closing time
const reopenCycleSchema = z
  .object({
    reason: z
      .string({ error: 'A reason is required to reopen a cycle' })
      .trim()
      .min(5, 'Please give a reason (at least 5 characters)')
      .max(500, 'Reason is too long (maximum 500 characters)'),
    closesAt: dateTime('Closing time').optional(),
  })
  .strict();

module.exports = {
  createCycleSchema,
  updateCycleSchema,
  activateCycleSchema,
  closeCycleSchema,
  reopenCycleSchema,
};