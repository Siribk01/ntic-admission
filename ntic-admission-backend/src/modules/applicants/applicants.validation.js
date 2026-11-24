// src/modules/applicants/applicants.validation.js
// What a request may contain when a parent adds or edits a child's profile or guardian details.

const { z } = require('zod');

const text = (label, max = 100) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');

const dateOfBirth = z.iso.date('Use the format YYYY-MM-DD').refine((value) => {
  const dob = new Date(`${value}T00:00:00Z`);
  const now = new Date();
  const oldest = new Date(Date.UTC(now.getUTCFullYear() - 25, now.getUTCMonth(), now.getUTCDate()));
  return dob < now && dob > oldest;
}, 'Date of birth must be in the past and realistic for a school applicant');

const GENDERS = ['male', 'female'];
const RELATIONSHIPS = ['father', 'mother', 'guardian', 'emergency_contact'];

// Fields that are optional while the profile is being filled in
const optionalFields = {
  placeOfBirth: text('Place of birth').nullable().optional(),
  stateOfOriginId: z.uuid('Choose a valid state of origin').nullable().optional(),
  contactPhone: phone.nullable().optional(),
  contactEmail: z.email('Enter a valid email address').max(254).transform((v) => v.toLowerCase()).nullable().optional(),
  addressLine: text('Address', 300).nullable().optional(),
  residenceStateId: z.uuid('Choose a valid state of residence').nullable().optional(),
};

const createApplicantSchema = z
  .object({
    firstName: text('First name', 80),
    middleName: text('Middle name', 80).nullable().optional(),
    surname: text('Surname', 80),
    dateOfBirth,
    gender: z.enum(GENDERS, { error: 'Gender must be male or female' }),
    nationality: text('Nationality', 60),
    ...optionalFields,
  })
  .strict();

// Every field optional on update, but at least one must be present
const updateApplicantSchema = z
  .object({
    firstName: text('First name', 80).optional(),
    middleName: text('Middle name', 80).nullable().optional(),
    surname: text('Surname', 80).optional(),
    dateOfBirth: dateOfBirth.optional(),
    gender: z.enum(GENDERS, { error: 'Gender must be male or female' }).optional(),
    nationality: text('Nationality', 60).optional(),
    ...optionalFields,
  })
  .strict();

const guardianSchema = z
  .object({
    fullName: text('Full name', 120),
    occupation: text('Occupation', 100).nullable().optional(),
    phone: phone.nullable().optional(),
    email: z.email('Enter a valid email address').max(254).transform((v) => v.toLowerCase()).nullable().optional(),
    address: text('Address', 300).nullable().optional(),
  })
  .strict();

const relationshipSchema = z.enum(RELATIONSHIPS, {
  error: `Relationship must be one of: ${RELATIONSHIPS.join(', ')}`,
});

module.exports = { createApplicantSchema, updateApplicantSchema, guardianSchema, relationshipSchema };
