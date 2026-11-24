// src/modules/applications/applications.service.js
// Business rules for application drafts.

const repo = require('./applications.repository');
const applicantsService = require('../applicants/applicants.service');
const feesService = require('../fees/fees.service');
const documentsRepo = require('../documents/documents.repository');
const statusHistory = require('../../utils/statusHistory');
const notifications = require('../notifications/notifications.service');
const settingsService = require('../settings/settings.service');
const accountRepo = require('../account/account.repository');
const { withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const {
  createApplicationSchema, updateApplicationSchema, CONSENT_VERSION,
} = require('./applications.validation');

// A list of what is still missing before the application could be submitted.
// This only REPORTS (so the form can show progress). Submission will enforce it.
function findMissing(application, applicant, missingDocuments = []) {
  const missing = [];
  const need = (ok, name) => { if (!ok) missing.push(name); };

  need(applicant.contactPhone, 'applicant.contactPhone');
  need(applicant.addressLine, 'applicant.addressLine');
  need(applicant.residenceStateId, 'applicant.residenceStateId');
  const kinds = applicant.guardians.map((g) => g.relationship);
  need(kinds.some((k) => ['father', 'mother', 'guardian'].includes(k)), 'guardians.parentOrGuardian');
  need(kinds.includes('emergency_contact'), 'guardians.emergencyContact');

  need(application.campusId, 'application.campusId');
  need(application.categoryId, 'application.categoryId');
  need(application.boarding, 'application.boarding');
  need(application.consentGivenAt, 'application.consent');
  if (application.heardFrom.includes('other')) need(application.heardFromOther, 'application.heardFromOther');
  for (const doc of missingDocuments) missing.push(`documents.${doc.code}`);
  return missing;
}

// Plain-language message for each item findMissing can report
const MISSING_MESSAGES = {
  'applicant.contactPhone': 'Add a contact phone number',
  'applicant.addressLine': 'Add the home address',
  'applicant.residenceStateId': 'Choose the state of residence',
  'guardians.parentOrGuardian': 'Add the father, mother or a guardian',
  'guardians.emergencyContact': 'Add an emergency contact',
  'application.campusId': 'Choose a campus',
  'application.categoryId': 'Choose an admission category',
  'application.boarding': 'Choose day or boarding',
  'application.consent': 'Give consent to continue',
  'application.heardFromOther': 'Say how you heard about NTIC (the "other" option needs a detail)',
};

async function present(application, parent) {
  const applicant = await applicantsService.withGuardians(
    await applicantsService.requireOwned(application.applicantId, parent.id)
  );
  const missingDocuments = await documentsRepo.listMissingRequired(application.id);
  return { ...application, applicant, missing: findMissing(application, applicant, missingDocuments) };
}

async function createApplication(parent, body) {
  const { applicantId, cycleId } = validate(createApplicationSchema, body);
  await applicantsService.requireOwned(applicantId, parent.id);

  if (!(await repo.findAcceptingCycle(cycleId))) {
    throw new AppError('This admission cycle is not accepting applications', 409, 'CYCLE_NOT_ACCEPTING');
  }
  let id;
  try {
    id = await repo.insert(applicantId, cycleId);
  } catch (err) {
    if (err.code === '23505') {
      throw AppError.conflict('This applicant already has an application in this cycle');
    }
    throw err;
  }
  return present(await repo.findOwned(id, parent.id), parent);
}

async function listApplications(parent) {
  return repo.listByParent(parent.id);
}

async function getApplication(parent, applicationId) {
  assertUuid(applicationId, 'Application id');
  const application = await repo.findOwned(applicationId, parent.id);
  if (!application) throw AppError.notFound('Application not found');
  return present(application, parent);
}

async function updateApplication(parent, applicationId, body) {
  assertUuid(applicationId, 'Application id');
  const data = validate(updateApplicationSchema, body);
  if (Object.keys(data).length === 0) throw AppError.badRequest('Send at least one field to change');

  await withTransaction(async (client) => {
    // Lock the row so two tabs saving at once cannot interleave, and so a submission cannot slip in
    if (!(await repo.lockOwned(applicationId, parent.id, client))) {
      throw AppError.notFound('Application not found');
    }
    const current = await repo.findOwned(applicationId, parent.id, client);
    if (current.status !== 'draft') {
      throw new AppError('This application has been submitted and can no longer be edited', 409, 'INVALID_STATE');
    }
    if (!(await repo.findAcceptingCycle(current.cycleId, client))) {
      throw new AppError('This admission cycle is no longer accepting applications', 409, 'CYCLE_NOT_ACCEPTING');
    }

    if (data.categoryId && !(await repo.isCategoryOfferedInCycle(current.cycleId, data.categoryId, client))) {
      throw AppError.validation([{ field: 'categoryId', message: 'This category is not offered in this admission cycle' }]);
    }
    const campusIds = [data.campusId, data.preferredExamCampusId].filter(Boolean);
    if (campusIds.length > 0) {
      const unique = [...new Set(campusIds)];
      const active = await repo.findActiveCampusIds(unique, client);
      if (active.length !== unique.length) {
        throw AppError.validation([{ field: 'campusId', message: 'One of the chosen campuses is not available' }]);
      }
    }
    if (data.preferredExamDate && data.preferredExamDate <= new Date().toISOString().slice(0, 10)) {
      throw AppError.validation([{ field: 'preferredExamDate', message: 'Preferred exam date must be in the future' }]);
    }

    await repo.update(applicationId, data, CONSENT_VERSION, client);
  });

  return getApplication(parent, applicationId);
}

async function submitApplication(parent, applicationId) {
  assertUuid(applicationId, 'Application id');

  // The parent's email must be confirmed, so the emails we send (payment, exam date, decision) reach a real inbox
  if ((await settingsService.getValues()).require_verified_email) {
    const account = await accountRepo.findUserById(parent.id);
    if (!account || !account.emailVerifiedAt) {
      throw new AppError(
        'Please confirm your email address before submitting. Check your inbox for the link, or ask for a new one.', 403, 'EMAIL_NOT_VERIFIED');
    }
  }

  await withTransaction(async (client) => {
    // Lock first: two taps on "Submit" (or a save at the same moment) must not both go through
    if (!(await repo.lockOwned(applicationId, parent.id, client))) {
      throw AppError.notFound('Application not found');
    }
    const current = await repo.findOwned(applicationId, parent.id, client);

    if (current.status !== 'draft') {
      throw new AppError('This application has already been submitted', 409, 'INVALID_STATE');
    }
    if (!(await repo.findAcceptingCycle(current.cycleId, client))) {
      throw new AppError('This admission cycle is no longer accepting applications', 409, 'CYCLE_NOT_ACCEPTING');
    }

    // Everything the form needs must be filled in
    const applicant = await applicantsService.withGuardians(
      await applicantsService.requireOwned(current.applicantId, parent.id)
    );
    const missingDocuments = await documentsRepo.listMissingRequired(applicationId, client);
    const missing = findMissing(current, applicant, missingDocuments);
    if (missing.length > 0) {
      const docNames = Object.fromEntries(missingDocuments.map((d) => [`documents.${d.code}`, `Upload the ${d.name.toLowerCase()}`]));
      throw AppError.validation(
        missing.map((field) => ({ field, message: MISSING_MESSAGES[field] || docNames[field] || 'This is required' })),
        'The application is not complete yet'
      );
    }

    // The choices may have changed since the draft was saved (category removed, campus switched off)
    if (!(await repo.isCategoryOfferedInCycle(current.cycleId, current.categoryId, client))) {
      throw AppError.validation([{ field: 'application.categoryId', message: 'This category is no longer offered in this cycle' }]);
    }
    if ((await repo.findActiveCampusIds([current.campusId], client)).length !== 1) {
      throw AppError.validation([{ field: 'application.campusId', message: 'The chosen campus is no longer available' }]);
    }

    // Work out the fee NOW and keep a copy. If no fee is configured this throws 404 FEE_NOT_CONFIGURED
    // and nothing is submitted (the system never guesses a price).
    const rule = await feesService.calculateFee(current.campusId, current.categoryId);

    const done = await repo.markSubmitted(
      applicationId,
      { amountMinor: rule.amountMinor, currency: rule.currency, ruleId: rule.id },
      client
    );
    if (!done) throw new AppError('This application has already been submitted', 409, 'INVALID_STATE');
    await statusHistory.record(client, { applicationId, from: 'draft', to: 'submitted', actorId: parent.id });
    await notifications.queueForApplication(client, applicationId, 'application_submitted');
  });

  return getApplication(parent, applicationId);
}

module.exports = { createApplication, listApplications, getApplication, updateApplication, submitApplication };
