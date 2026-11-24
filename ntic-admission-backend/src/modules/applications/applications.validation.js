// src/modules/applications/applications.validation.js
const { z } = require('zod');

const HEARD_FROM = [
  'newspaper', 'television', 'handbill', 'banner', 'friends_relatives', 'siblings', 'parent',
  'instagram', 'facebook', 'billboard', 'ntic_staff', 'educational_website', 'alumni', 'other',
];
const CONSENT_VERSION = 'v1'; // bump when the legal wording changes

const createApplicationSchema = z
  .object({
    applicantId: z.uuid('Choose a valid applicant'),
    cycleId: z.uuid('Choose a valid admission cycle'),
  })
  .strict();

const note = (label, max) => z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

// Every field optional (draft), null clears a field. "consent: true" records agreement.
const updateApplicationSchema = z
  .object({
    campusId: z.uuid('Choose a valid campus').nullable().optional(),
    categoryId: z.uuid('Choose a valid category').nullable().optional(),
    program: note('Program', 100).nullable().optional(),
    boarding: z.enum(['day', 'boarding'], { error: 'Boarding must be day or boarding' }).nullable().optional(),
    heardFrom: z
      .array(z.enum(HEARD_FROM, { error: 'Unknown option' }))
      .max(HEARD_FROM.length)
      .refine((a) => new Set(a).size === a.length, 'Each option may be chosen once')
      .optional(),
    heardFromOther: note('Detail', 200).nullable().optional(),
    preferredExamDate: z.iso.date('Use the format YYYY-MM-DD').nullable().optional(),
    preferredExamTime: z.enum(['morning', 'afternoon'], { error: 'Choose morning or afternoon' }).nullable().optional(),
    preferredExamCampusId: z.uuid('Choose a valid exam centre').nullable().optional(),
    interviewAvailability: note('Interview availability', 300).nullable().optional(),
    consent: z.literal(true, { error: 'Consent can only be given (true), not withdrawn here' }).optional(),
  })
  .strict();

module.exports = { createApplicationSchema, updateApplicationSchema, CONSENT_VERSION };
