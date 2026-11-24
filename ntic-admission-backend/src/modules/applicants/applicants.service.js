// src/modules/applicants/applicants.service.js
// Business rules for a parent's children (applicants) and their guardians.

const repo = require('./applicants.repository');
const AppError = require('../../utils/AppError');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const {
  createApplicantSchema, updateApplicantSchema, guardianSchema, relationshipSchema,
} = require('./applicants.validation');

async function assertStatesActive(data) {
  const wanted = [data.stateOfOriginId, data.residenceStateId].filter(Boolean);
  if (wanted.length === 0) return;
  const unique = [...new Set(wanted)];
  const found = await repo.findActiveStateIds(unique);
  if (found.length !== unique.length) {
    throw AppError.validation([{ field: 'state', message: 'One of the chosen states is not available' }]);
  }
}

// Loads an applicant owned by this parent, or throws 404 (also when it belongs to someone else)
async function requireOwned(applicantId, parentUserId) {
  assertUuid(applicantId, 'Applicant id');
  const applicant = await repo.findOwned(applicantId, parentUserId);
  if (!applicant) throw AppError.notFound('Applicant not found');
  return applicant;
}

async function withGuardians(applicant) {
  return { ...applicant, guardians: await repo.listGuardians(applicant.id) };
}

async function createApplicant(parent, body) {
  const data = validate(createApplicantSchema, body);
  await assertStatesActive(data);
  let id;
  try {
    id = await repo.insert(parent.id, data);
  } catch (err) {
    if (err.code === '23505') {
      throw AppError.conflict('You have already added an applicant with this name and date of birth');
    }
    throw err;
  }
  return withGuardians(await repo.findOwned(id, parent.id));
}

async function listApplicants(parent) {
  return repo.listByParent(parent.id);
}

async function getApplicant(parent, applicantId) {
  return withGuardians(await requireOwned(applicantId, parent.id));
}

async function updateApplicant(parent, applicantId, body) {
  const data = validate(updateApplicantSchema, body);
  if (Object.keys(data).length === 0) throw AppError.badRequest('Send at least one field to change');
  await requireOwned(applicantId, parent.id);
  await assertStatesActive(data);
  try {
    await repo.update(applicantId, parent.id, data);
  } catch (err) {
    if (err.code === '23505') {
      throw AppError.conflict('You have already added an applicant with this name and date of birth');
    }
    throw err;
  }
  return withGuardians(await repo.findOwned(applicantId, parent.id));
}

async function saveGuardian(parent, applicantId, relationship, body) {
  const rel = validate(relationshipSchema, relationship);
  const data = validate(guardianSchema, body);
  await requireOwned(applicantId, parent.id);
  return repo.upsertGuardian(applicantId, rel, data);
}

async function removeGuardian(parent, applicantId, relationship) {
  const rel = validate(relationshipSchema, relationship);
  await requireOwned(applicantId, parent.id);
  if (!(await repo.deleteGuardian(applicantId, rel))) throw AppError.notFound('Guardian entry not found');
}

module.exports = {
  createApplicant, listApplicants, getApplicant, updateApplicant, saveGuardian, removeGuardian,
  requireOwned, withGuardians,
};
