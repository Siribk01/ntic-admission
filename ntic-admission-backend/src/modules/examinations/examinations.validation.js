// src/modules/examinations/examinations.validation.js
const { z } = require('zod');

// Our own wording only when the value is not a number at all; other problems keep their own messages
const numberError = (label) => (issue) => (issue.code === 'invalid_type' ? `${label} must be a number` : undefined);

const createSlotSchema = z
  .object({
    cycleId: z.uuid('cycleId must be a valid id'),
    campusId: z.uuid('campusId must be a valid id'),
    startsAt: z.iso.datetime({ offset: true, error: 'startsAt must include a time zone, e.g. 2027-02-01T09:00:00+01:00' }),
    durationMinutes: z.number({ error: numberError('Duration') }).int('Duration must be a whole number').min(15, 'Duration must be at least 15 minutes').max(480, 'Duration cannot be more than 480 minutes').optional(),
    venue: z.string({ error: 'Venue is required' }).trim().min(2, 'Venue is too short').max(150, 'Venue is too long'),
    capacity: z.number({ error: numberError('Capacity') }).int('Capacity must be a whole number').min(1, 'Capacity must be at least 1').max(2000, 'Capacity cannot be more than 2000'),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (Date.parse(data.startsAt) <= Date.now()) {
      ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'The slot must start in the future' });
    }
  });

// Only things that are safe to change once people may be booked. (Moving the time = create a new slot and reschedule.)
const updateSlotSchema = z
  .object({
    capacity: z.number().int().min(1).max(2000).optional(),
    venue: z.string().trim().min(2).max(150).optional(),
    status: z.enum(['open', 'closed'], { error: 'Status must be open or closed' }).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to change' });

const listSlotsSchema = z
  .object({
    cycleId: z.uuid('cycleId must be a valid id').optional(),
    campusId: z.uuid('campusId must be a valid id').optional(),
    status: z.enum(['open', 'closed']).optional(),
    upcoming: z.enum(['true', 'false']).optional(),
  })
  .strict();

const scheduleSchema = z
  .object({
    slotId: z.uuid('slotId must be a valid id'),
    reason: z.string().trim().min(3, 'Please give a reason (at least 3 characters)').max(300).optional(),
  })
  .strict();

const cancelSchema = z
  .object({ reason: z.string({ error: 'A reason is required' }).trim().min(3, 'Please give a reason (at least 3 characters)').max(300) })
  .strict();

module.exports = { createSlotSchema, updateSlotSchema, listSlotsSchema, scheduleSchema, cancelSchema };
