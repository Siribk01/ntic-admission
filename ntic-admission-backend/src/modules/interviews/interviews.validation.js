// src/modules/interviews/interviews.validation.js
const { z } = require('zod');

const numberError = (label) => (issue) => (issue.code === 'invalid_type' ? `${label} must be a number` : undefined);
const reason = z.string().trim().min(3, 'Please give a reason (at least 3 characters)').max(300);
const PLATFORMS = ['google_meet', 'microsoft_teams', 'zoom', 'phone', 'in_person', 'other'];

const validTimeZone = (tz) => {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
};
const httpsUrl = (value) => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

const scheduleSchema = z
  .object({
    interviewerId: z.uuid('interviewerId must be a valid id'),
    startsAt: z.iso.datetime({ offset: true, error: 'startsAt must include a time zone, e.g. 2027-02-01T10:00:00+01:00' }),
    durationMinutes: z.number({ error: numberError('Duration') }).int('Duration must be a whole number').min(10, 'Duration must be at least 10 minutes').max(240, 'Duration cannot be more than 240 minutes').optional(),
    timezone: z.string({ error: 'timezone must be text, e.g. Africa/Lagos' }).trim().refine(validTimeZone, 'Unknown time zone. Use a name like Africa/Lagos or Europe/London').optional(),
    platform: z.enum(PLATFORMS, { error: `platform must be one of: ${PLATFORMS.join(', ')}` }),
    meetingUrl: z.string().trim().max(500, 'The link is too long').refine(httpsUrl, 'The meeting link must be a full https:// address').optional(),
    location: z.string().trim().min(3, 'Say where the interview will be').max(300, 'The location is too long (300 characters)').optional(),
    instructions: z.string().trim().max(1000, 'Instructions are too long (1000 characters)').optional(),
    reason: reason.optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const online = !['phone', 'in_person'].includes(d.platform);
    if (online && !d.meetingUrl) {
      ctx.addIssue({ code: 'custom', path: ['meetingUrl'], message: 'A meeting link is required (phone and in-person interviews can go without one)' });
    }
    if (d.platform === 'in_person' && !d.location) {
      ctx.addIssue({ code: 'custom', path: ['location'], message: 'Say where the interview will be (building, room, campus)' });
    }
    if (d.platform === 'in_person' && d.meetingUrl) {
      ctx.addIssue({ code: 'custom', path: ['meetingUrl'], message: 'An in-person interview has no meeting link' });
    }
    if (d.platform !== 'in_person' && d.location) {
      ctx.addIssue({ code: 'custom', path: ['location'], message: 'A location is only for in-person interviews' });
    }
    if (Date.parse(d.startsAt) <= Date.now()) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'The interview must start in the future' });
    if (Date.parse(d.startsAt) > Date.now() + 366 * 864e5) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'The interview is too far in the future' });
  });

const cancelSchema = z.object({ reason: z.string({ error: 'A reason is required' }).trim().min(3, 'Please give a reason (at least 3 characters)').max(300) }).strict();
const outcomeSchema = z.object({ attended: z.boolean({ error: 'attended must be true or false' }), reason: reason.optional() }).strict();

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-02-01');
const count = z.string().regex(/^\d+$/, 'Must be a whole number');
const listSchema = z
  .object({
    status: z.enum(['scheduled', 'completed', 'absent', 'cancelled']).optional(),
    interviewerId: z.uuid('interviewerId must be a valid id').optional(),
    campusId: z.uuid('campusId must be a valid id').optional(),
    from: day.optional(),
    to: day.optional(),
    limit: count.optional(),
    offset: count.optional(),
  })
  .strict();

// ----- scorecard criteria (what the form asks) -----
const criterionBase = {
  label: z.string({ error: 'Label is required' }).trim().min(2, 'Label is too short').max(80, 'Label is too long'),
  description: z.string().trim().max(300, 'Description is too long').nullable().optional(),
  maxScore: z.number({ error: numberError('Maximum score') }).int('Maximum score must be a whole number').min(1, 'Maximum score must be at least 1').max(100, 'Maximum score cannot be more than 100'),
  position: z.number({ error: numberError('Position') }).int('Position must be a whole number').min(0).max(1000),
};
const createCriterionSchema = z
  .object({
    key: z.string({ error: 'key is required' }).trim().toLowerCase().regex(/^[a-z][a-z0-9_]{1,39}$/, 'key must be 2-40 lower-case letters, numbers or underscores, starting with a letter'),
    label: criterionBase.label,
    description: criterionBase.description,
    maxScore: criterionBase.maxScore.optional(),
    position: criterionBase.position.optional(),
  })
  .strict();
const updateCriterionSchema = z
  .object({
    label: criterionBase.label.optional(),
    description: criterionBase.description,
    maxScore: criterionBase.maxScore.optional(),
    position: criterionBase.position.optional(),
    active: z.boolean({ error: 'active must be true or false' }).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to change' });

// ----- the scorecard itself -----
const RECOMMENDATIONS = ['strongly_recommend', 'recommend', 'neutral', 'not_recommended'];
const saveScorecardSchema = z
  .object({
    scores: z
      .array(
        z.object({
          criterion: z.string({ error: 'criterion is required' }).trim().toLowerCase().min(2).max(40),
          score: z.number({ error: numberError('Score') }).int('Score must be a whole number').min(0, 'Score cannot be negative'),
          comment: z.string().trim().max(500, 'Comment is too long (500 characters)').optional(),
        }).strict(),
        { error: 'scores must be a list' }
      )
      .max(30, 'Too many scores')
      .superRefine((lines, ctx) => {
        const seen = new Set();
        lines.forEach((l, i) => {
          if (seen.has(l.criterion)) ctx.addIssue({ code: 'custom', path: [i, 'criterion'], message: `"${l.criterion}" appears twice` });
          seen.add(l.criterion);
        });
      })
      .default([]),
    recommendation: z.enum(RECOMMENDATIONS, { error: `recommendation must be one of: ${RECOMMENDATIONS.join(', ')}` }).optional(),
    notes: z.string().trim().max(3000, 'Notes are too long (3000 characters)').optional(),
  })
  .strict()
  .refine((d) => d.scores.length > 0 || d.recommendation || d.notes, { message: 'Nothing to save: add at least one score, a recommendation or notes' });

const reopenSchema = z.object({ reason: z.string({ error: 'A reason is required' }).trim().min(3, 'Please give a reason (at least 3 characters)').max(300) }).strict();

module.exports = {
  scheduleSchema, cancelSchema, outcomeSchema, listSchema,
  createCriterionSchema, updateCriterionSchema, saveScorecardSchema, reopenSchema, PLATFORMS, RECOMMENDATIONS,
};
