// src/modules/staff/staff.validation.js
// What an administrator must send to create a staff account.

const { z } = require('zod');
const { registerSchema } = require('../auth/auth.validation');
const { ROLES, STAFF_ROLES } = require('../../constants/roles');

// Reuse the email, password, name and phone rules from sign-up, and add role and campuses
const createStaffSchema = registerSchema
  .extend({
    role: z.enum(STAFF_ROLES, { error: `Role must be one of: ${STAFF_ROLES.join(', ')}` }),
    campusIds: z.array(z.uuid('Each campus id must be a valid id')).optional(),
  })
  .superRefine((data, ctx) => {
    const count = new Set(data.campusIds || []).size;

    if (data.role === ROLES.CENTRAL_ADMIN && count > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['campusIds'],
        message: 'Central administrators have organization-wide access; do not assign campuses',
      });
    }
    if (data.role !== ROLES.CENTRAL_ADMIN && count === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['campusIds'],
        message: 'Assign at least one campus to this role',
      });
    }
  });

module.exports = { createStaffSchema };