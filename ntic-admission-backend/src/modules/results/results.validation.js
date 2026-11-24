// src/modules/results/results.validation.js
const { z } = require('zod');

const numberError = (label) => (issue) => (issue.code === 'invalid_type' ? `${label} must be a number` : undefined);
const reason = z.string().trim().min(3, 'Please give a reason (at least 3 characters)').max(300);
const twoDecimals = (n) => Math.round(n * 100) / 100 === n;

// "Mathematics", " general studies " -> "mathematics", "general_studies"
const subjectName = z
  .string({ error: 'Subject is required' })
  .transform((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
  .pipe(z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Subject must be 2-40 letters or numbers, starting with a letter'));

const scoreLine = z
  .object({
    subject: subjectName,
    score: z.number({ error: numberError('Score') }).min(0, 'Score cannot be negative').refine(twoDecimals, 'Score can have at most 2 decimal places'),
    maxScore: z.number({ error: numberError('Maximum score') }).gt(0, 'Maximum score must be more than 0').max(1000, 'Maximum score cannot be more than 1000').refine(twoDecimals, 'Maximum score can have at most 2 decimal places'),
  })
  .strict()
  .refine((l) => l.score <= l.maxScore, { message: 'Score cannot be more than the maximum score', path: ['score'] });

// Shared by the single entry and the CSV import (which builds the same lines)
const scoresArray = z
  .array(scoreLine, { error: 'scores must be a list' })
  .min(1, 'Enter at least one subject score')
  .max(20, 'No more than 20 subjects')
  .superRefine((lines, ctx) => {
    const seen = new Set();
    lines.forEach((l, i) => {
      if (seen.has(l.subject)) ctx.addIssue({ code: 'custom', path: [i, 'subject'], message: `Subject "${l.subject}" appears twice` });
      seen.add(l.subject);
    });
  });

const enterResultSchema = z
  .object({
    scores: scoresArray,
    remarks: z.string().trim().max(500, 'Remarks are too long (500 characters)').optional(),
    reason: reason.optional(),
  })
  .strict();

const attendanceSchema = z
  .object({ attended: z.boolean({ error: 'attended must be true or false' }), reason: reason.optional() })
  .strict();

const bulkAttendanceSchema = z
  .object({
    marks: z
      .array(
        z.object({ examNumber: z.string({ error: 'examNumber is required' }).trim().min(3).max(40), attended: z.boolean({ error: 'attended must be true or false' }) }).strict(),
        { error: 'marks must be a list' }
      )
      .min(1, 'Send at least one mark')
      .max(500, 'No more than 500 marks at a time'),
  })
  .strict();

const importQuerySchema = z.object({ dryRun: z.enum(['true', 'false']).optional() }).strict();

module.exports = { enterResultSchema, attendanceSchema, bulkAttendanceSchema, importQuerySchema, scoreLine, scoresArray };
