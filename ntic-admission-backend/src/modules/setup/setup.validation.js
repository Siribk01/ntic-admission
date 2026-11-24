// src/modules/setup/setup.validation.js
// What an admin may send when setting up sessions, classes, campuses, fees and staff accounts.
const { z } = require('zod');
const { ROLES } = require('../../constants/roles');

const text = (label, min, max) => z.string({ error: `${label} is required` }).trim().min(min, `${label} must be at least ${min} characters`).max(max, `${label} is too long (at most ${max})`);
const optionalText = (label, max) => z.string({ error: `${label} must be text` }).trim().max(max, `${label} is too long (at most ${max})`);
const code = z.string({ error: 'Code is required' }).trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, 'Code is 2-20 letters, numbers, - or _ (for example MAIN or JSS1)');
const id = (label) => z.uuid(`${label} must be a valid id`);
const dateTime = z.iso.datetime({ offset: true, error: 'Use a date and time with a time zone, e.g. 2027-01-05T08:00:00+01:00' });
const isoDate = z.iso.date('Use the format YYYY-MM-DD');
const naira = z.string({ error: 'Amount is required' }).trim().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter the amount in naira, for example 10000 or 10000.50');

// ---------- admission sessions ("cycles") ----------
const CYCLE_STATUS = ['draft', 'active', 'closed'];
const cycleFields = {
  name: text('Name', 3, 100),
  academicSession: z.string({ error: 'Academic session is required' }).trim().regex(/^\d{4}\/\d{4}$/, 'Use the format 2026/2027'),
  status: z.enum(CYCLE_STATUS, { error: 'Status must be draft, active or closed' }),
  opensAt: dateTime,
  closesAt: dateTime,
};
const createCycleSchema = z.object({ ...cycleFields, status: cycleFields.status.default('draft') }).strict()
  .refine((d) => Date.parse(d.closesAt) > Date.parse(d.opensAt), { path: ['closesAt'], message: 'The closing date must be after the opening date' });
const updateCycleSchema = z.object(Object.fromEntries(Object.entries(cycleFields).map(([k, v]) => [k, v.optional()]))).strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to change' });
const cycleCategoriesSchema = z.object({ categoryIds: z.array(id('Category'), { error: 'categoryIds must be a list' }).max(50) }).strict();

// ---------- classes / categories ----------
const createCategorySchema = z.object({
  name: text('Name', 2, 80), code,
  description: optionalText('Description', 300).optional(),
  sortOrder: z.number({ error: 'Sort order must be a number' }).int().min(0).max(9999).optional(),
}).strict();
const updateCategorySchema = z.object({
  name: text('Name', 2, 80).optional(), description: optionalText('Description', 300).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(), isActive: z.boolean({ error: 'isActive must be true or false' }).optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to change' });

// ---------- campuses ----------
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');
const createCampusSchema = z.object({
  stateId: id('State'), name: text('Name', 2, 100), code,
  address: optionalText('Address', 300).optional(), phone: phone.optional(), email: z.email('Enter a valid email address').optional(),
}).strict();
const updateCampusSchema = z.object({
  stateId: id('State').optional(), name: text('Name', 2, 100).optional(),
  address: optionalText('Address', 300).nullable().optional(), phone: phone.nullable().optional(), email: z.email('Enter a valid email address').nullable().optional(),
  isActive: z.boolean({ error: 'isActive must be true or false' }).optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to change' });

// ---------- fees ----------
// A rule is for one class. Leave campus and state empty for "every campus"; set ONE of them for a campus-specific or state-wide price.
const createFeeSchema = z.object({
  categoryId: id('Category'), campusId: id('Campus').optional(), stateId: id('State').optional(),
  amount: naira, effectiveFrom: isoDate, effectiveTo: isoDate.optional(), notes: optionalText('Notes', 300).optional(),
}).strict()
  .refine((d) => !(d.campusId && d.stateId), { path: ['stateId'], message: 'Choose a campus or a state, not both' })
  .refine((d) => !d.effectiveTo || d.effectiveTo >= d.effectiveFrom, { path: ['effectiveTo'], message: 'The end date cannot be before the start date' });
const updateFeeSchema = z.object({
  amount: naira.optional(), effectiveTo: isoDate.nullable().optional(), active: z.boolean({ error: 'active must be true or false' }).optional(), notes: optionalText('Notes', 300).nullable().optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to change' });

// ---------- staff ----------
const STAFF_ROLES = Object.values(ROLES).filter((r) => r !== ROLES.APPLICANT);
const role = z.enum(STAFF_ROLES, { error: `Role must be one of: ${STAFF_ROLES.join(', ')}` });
const createStaffSchema = z.object({
  email: z.email('Enter a valid email address').transform((e) => e.toLowerCase()),
  firstName: text('First name', 1, 60), lastName: text('Last name', 1, 60), phone: phone.optional(),
  role, campusIds: z.array(id('Campus')).max(50).optional(),
  password: z.string({ error: 'Password is required' }), // checked against the password policy in the service
}).strict();
const updateStaffSchema = z.object({
  firstName: text('First name', 1, 60).optional(), lastName: text('Last name', 1, 60).optional(), phone: phone.nullable().optional(),
  role: role.optional(), campusIds: z.array(id('Campus')).max(50).optional(), isActive: z.boolean({ error: 'isActive must be true or false' }).optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to change' });
const resetPasswordSchema = z.object({ password: z.string({ error: 'Password is required' }) }).strict();

module.exports = {
  createCycleSchema, updateCycleSchema, cycleCategoriesSchema, createCategorySchema, updateCategorySchema,
  createCampusSchema, updateCampusSchema, createFeeSchema, updateFeeSchema, createStaffSchema, updateStaffSchema, resetPasswordSchema,
};
