// src/modules/corrections/corrections.validation.js
const { z } = require('zod');

// Only these details can be corrected after submission. Everything else (campus, category, documents) goes through staff.
const FIELDS = {
  firstName: { column: 'first_name', label: 'first name', adminOnly: false },
  middleName: { column: 'middle_name', label: 'middle name', adminOnly: false },
  surname: { column: 'surname', label: 'surname', adminOnly: false },
  dateOfBirth: { column: 'date_of_birth', label: 'date of birth', adminOnly: true },
  gender: { column: 'gender', label: 'gender', adminOnly: false },
  contactPhone: { column: 'contact_phone', label: 'contact phone', adminOnly: false },
  addressLine: { column: 'address_line', label: 'address', adminOnly: false },
};

const name = (label) => z.string({ error: `${label} must be text` }).trim().min(1, `${label} cannot be empty`).max(80, `${label} is too long`);
const VALUE = {
  firstName: name('First name'),
  middleName: name('Middle name').nullable(),
  surname: name('Surname'),
  dateOfBirth: z.iso.date('Use the format YYYY-MM-DD').refine((v) => {
    const dob = new Date(`${v}T00:00:00Z`); const now = new Date();
    return dob < now && dob > new Date(Date.UTC(now.getUTCFullYear() - 25, now.getUTCMonth(), now.getUTCDate()));
  }, 'Date of birth must be in the past and realistic for a school applicant'),
  gender: z.enum(['male', 'female'], { error: 'Gender must be male or female' }),
  contactPhone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
  addressLine: z.string().trim().min(1, 'Address cannot be empty').max(300, 'Address is too long'),
};

const reason = z.string({ error: 'A reason is required' }).trim().min(5, 'Please explain the reason (at least 5 characters)').max(500, 'The reason is too long (at most 500 characters)');

const createSchema = z.object({
  field: z.enum(Object.keys(FIELDS), { error: `field must be one of: ${Object.keys(FIELDS).join(', ')}` }),
  newValue: z.union([z.string(), z.null()], { error: 'newValue is required' }),
  reason,
}).strict().superRefine((d, ctx) => {
  const r = VALUE[d.field].safeParse(d.newValue);
  if (!r.success) for (const i of r.error.issues) ctx.addIssue({ code: 'custom', path: ['newValue'], message: i.message });
});
const parsedValue = (field, value) => VALUE[field].parse(value);

const note = z.string({ error: 'note must be text' }).trim().max(500, 'The note is too long (at most 500 characters)');
const approveSchema = z.object({ note: note.optional() }).strict();
const rejectSchema = z.object({ note: note.min(5, 'Tell the parent why (at least 5 characters)') }).strict();
const listSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled'], { error: 'Status must be pending, approved, rejected or cancelled' }).default('pending'),
  limit: z.coerce.number({ error: 'limit must be a number' }).int().min(1).max(100).default(50),
}).strict();

module.exports = { FIELDS, createSchema, parsedValue, approveSchema, rejectSchema, listSchema };
