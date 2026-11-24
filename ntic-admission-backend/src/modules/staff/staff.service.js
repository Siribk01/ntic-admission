// src/modules/staff/staff.service.js
// Business rules for staff accounts. Called only by central administrators.

const usersRepo = require('../users/users.repository');
const auditService = require('../audit/audit.service');
const locationsService = require('../locations/locations.service');
const { withTransaction } = require('../../db/pool');
const { hashPassword } = require('../../utils/password');
const { validate } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const { createStaffSchema } = require('./staff.validation');

// context = { actor, ip, userAgent }: who is doing this, and where from
async function createStaff(input, context = {}) {
  const data = validate(createStaffSchema, input);

  // Remove duplicates, then make sure every campus really exists and is active
  const campusIds = [...new Set(data.campusIds || [])];
  if (campusIds.length > 0) {
    await locationsService.assertCampusesActive(campusIds);
  }

  const passwordHash = await hashPassword(data.password);

  try {
    // One transaction: the user and their campus access are saved together or not at all
    const user = await withTransaction(async (client) => {
      const created = await usersRepo.createUser(
        {
          email: data.email,
          phone: data.phone ?? null,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
        },
        client
      );
      if (campusIds.length > 0) {
        await usersRepo.addCampusScopes(created.id, campusIds, client);
      }

      // Inside the same transaction: if the log cannot be saved, the new account is not created either
      await auditService.record(
        {
          actor: context.actor,
          action: 'staff.create',
          resourceType: 'user',
          resourceId: created.id,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: { email: created.email, role: created.role, campusIds },
        },
        { client }
      );

      return created;
    });

    return { ...user, campusIds };
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'users_email_uq') {
      throw AppError.conflict('An account with this email already exists');
    }
    throw err;
  }
}

module.exports = { createStaff };