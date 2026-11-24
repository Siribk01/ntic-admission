// src/modules/decisions/decisions.service.js
// Staff review (information requests, decisions, reopening) and the parent's side (respond, withdraw, accept or decline an offer).

const repo = require('./decisions.repository');
const applicantsRepo = require('../applicants/applicants.repository');
const documentsRepo = require('../documents/documents.repository');
const paymentsRepo = require('../payments/payments.repository');
const examsRepo = require('../examinations/examinations.repository');
const auditService = require('../audit/audit.service');
const notifications = require('../notifications/notifications.service');
const feesService = require('../fees/fees.service');
const settingsService = require('../settings/settings.service');
const jobsRepo = require('../jobs/jobs.repository');
const statusHistory = require('../../utils/statusHistory');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { getCampusScope } = require('../../utils/campusScope');
const { formatMajor } = require('../../utils/money');
const AppError = require('../../utils/AppError');
const { TERMINAL_STATUSES } = require('../../constants/applicationStatus');
const {
  requestInformationSchema, sendForDecisionSchema, decisionSchema, reopenSchema, respondSchema, withdrawSchema, listSchema,
} = require('./decisions.validation');

const OUTCOME_STATUS = { offer: 'offered', waitlist: 'waitlisted', reject: 'rejected' };
const inScope = (scope, campusId) => !scope || scope.includes(campusId);

const auditEvent = (context, action, resourceId, metadata) => ({
  actor: context.actor, action, resourceType: 'application', resourceId,
  ip: context.ip, userAgent: context.userAgent, metadata,
});

// Locks the application for a staff action and checks campus scope (other campus = "not found")
async function lockForStaff(applicationId, context, client) {
  assertUuid(applicationId, 'Application id');
  const scope = await getCampusScope(context.actor);
  const application = await repo.lockApplication(applicationId, client);
  if (!application || !inScope(scope, application.campusId)) throw AppError.notFound('Application not found');
  return application;
}

function assertFrom(application, allowed, message) {
  if (!allowed.includes(application.status)) throw new AppError(message, 409, 'INVALID_STATE');
}

// ===================== staff: reading =====================

async function listApplications(query, actor) {
  const filters = validate(listSchema, query);
  const rows = await repo.listApplications({ ...filters, campusScope: await getCampusScope(actor) });
  const total = rows.length ? rows[0].total : 0;
  return {
    total,
    items: rows.map(({ total: _t, feeAmountMinor, paidMinor, ...row }) => ({
      ...row,
      paymentStatus: paidMinor === 0 ? 'unpaid' : paidMinor < feeAmountMinor ? 'part_paid' : 'paid',
    })),
  };
}

async function getApplicationForStaff(applicationId, actor) {
  assertUuid(applicationId, 'Application id');
  const detail = await repo.findApplicationDetail(applicationId);
  if (!detail || !inScope(await getCampusScope(actor), detail.campusId)) throw AppError.notFound('Application not found');

  const campusScope = await getCampusScope(actor);
  const [guardians, documents, payments, exam, decisions, history] = await Promise.all([
    applicantsRepo.listGuardians(detail.applicantId),
    documentsRepo.listForApplication(applicationId),
    paymentsRepo.listForStaff({ applicationId, campusScope, limit: 100 }),
    examsRepo.findExamByApplication(applicationId),
    repo.listDecisions(applicationId),
    repo.listHistoryForStaff(applicationId),
  ]);
  const paymentStatus = detail.paidMinor === 0 ? 'unpaid' : detail.paidMinor < detail.feeAmountMinor ? 'part_paid' : 'paid';
  return {
    ...detail,
    paymentStatus,
    fee: formatMajor(detail.feeAmountMinor),
    guardians,
    documents: documents.map(({ storedName, ...doc }) => doc),
    payments,
    exam,
    decisions,
    history,
  };
}

// ===================== staff: actions =====================

async function requestInformation(applicationId, input, context) {
  const { message } = validate(requestInformationSchema, input);
  await withTransaction(async (client) => {
    const application = await lockForStaff(applicationId, context, client);
    assertFrom(application, ['under_review', 'decision_pending'], 'Information can only be requested while the application is under review');
    await statusHistory.transition(client, {
      applicationId, from: application.status, to: 'information_required',
      actorId: context.actor.id, reason: message, publicNote: message,
    });
    await notifications.queueForApplication(client, applicationId, 'information_requested', { message });
    await auditService.record(auditEvent(context, 'application.request_information', applicationId, {
      applicationNumber: application.applicationNumber, message,
    }), { client });
  });
  return getApplicationForStaff(applicationId, context.actor);
}

async function sendForDecision(applicationId, input, context) {
  const { notes } = validate(sendForDecisionSchema, input);
  await withTransaction(async (client) => {
    const application = await lockForStaff(applicationId, context, client);
    assertFrom(application, ['under_review'], 'Only an application under review can be sent for a decision');
    await statusHistory.transition(client, {
      applicationId, from: 'under_review', to: 'decision_pending', actorId: context.actor.id, reason: notes,
    });
    await auditService.record(auditEvent(context, 'application.send_for_decision', applicationId, {
      applicationNumber: application.applicationNumber,
    }), { client });
  });
  return getApplicationForStaff(applicationId, context.actor);
}

async function decide(applicationId, input, context) {
  const data = validate(decisionSchema, input);
  const toStatus = OUTCOME_STATUS[data.outcome];

  await withTransaction(async (client) => {
    const application = await lockForStaff(applicationId, context, client);
    assertFrom(application, ['under_review', 'decision_pending', 'waitlisted'],
      'A decision can only be recorded for an application under review, pending decision or waitlisted');

    await repo.insertDecision({
      applicationId, outcome: toStatus, reasonCode: data.reasonCode, notes: data.notes,
      publicMessage: data.publicMessage, offerDeadline: data.offerDeadline, decidedBy: context.actor.id,
    }, client);
    await statusHistory.transition(client, {
      applicationId, from: application.status, to: toStatus, actorId: context.actor.id,
      reason: data.notes || data.reasonCode, publicNote: data.publicMessage,
    });
    await notifications.queueForApplication(client, applicationId, `decision_${data.outcome}`, {
      message: data.publicMessage, offerDeadline: data.offerDeadline,
    });
    await auditService.record(auditEvent(context, `decision.${data.outcome}`, applicationId, {
      applicationNumber: application.applicationNumber, reasonCode: data.reasonCode ?? null,
      offerDeadline: data.offerDeadline ?? null,
    }), { client });
  });
  return getApplicationForStaff(applicationId, context.actor);
}

async function reopen(applicationId, input, context) {
  const { reason } = validate(reopenSchema, input);
  await withTransaction(async (client) => {
    const application = await lockForStaff(applicationId, context, client);
    assertFrom(application, TERMINAL_STATUSES, 'Only a rejected, withdrawn or closed application can be reopened');

    // An application that EXPIRED unpaid goes back to "submitted", not to review: the fee was never paid.
    // It is re-quoted under the current fee rules (FR-055) and its payment clock starts again.
    const last = application.status === 'closed' ? await repo.findLastTransition(applicationId, client) : null;
    const expiredUnpaid = Boolean(last && last.from === 'submitted' && last.to === 'closed');

    if (expiredUnpaid) {
      const fee = await feesService.calculateFee(application.campusId, application.categoryId); // 404 FEE_NOT_CONFIGURED stops the reopen
      await repo.updateFeeSnapshot(applicationId, { amountMinor: fee.amountMinor, currency: fee.currency, ruleId: fee.id }, client);
      await statusHistory.transition(client, {
        applicationId, from: 'closed', to: 'submitted', actorId: context.actor.id, reason,
        publicNote: 'Your application has been reopened. Please pay the application fee to continue.',
      });
      const { unpaid_expiry_days: days } = await settingsService.getValues();
      const paymentDeadline = await jobsRepo.findPaymentDeadline(applicationId, days, client);
      await notifications.queueForApplication(client, applicationId, 'application_reopened', { awaitingPayment: true, paymentDeadline });
    } else {
      await statusHistory.transition(client, {
        applicationId, from: application.status, to: 'under_review', actorId: context.actor.id, reason,
        publicNote: 'Your application has been reopened for review',
      });
      await notifications.queueForApplication(client, applicationId, 'application_reopened');
    }
    await auditService.record(auditEvent(context, 'application.reopen', applicationId, {
      applicationNumber: application.applicationNumber, from: application.status, reason, expiredUnpaid,
    }), { client });
  });
  return getApplicationForStaff(applicationId, context.actor);
}

// ===================== parent =====================

// Locks the application for a parent action. Someone else's application is "not found".
async function lockForParent(applicationId, parent, client) {
  assertUuid(applicationId, 'Application id');
  const application = await repo.lockApplication(applicationId, client);
  if (!application || application.parentUserId !== parent.id) throw AppError.notFound('Application not found');
  return application;
}

async function respondToInformationRequest(applicationId, input, context) {
  const { message } = validate(respondSchema, input);
  await withTransaction(async (client) => {
    const application = await lockForParent(applicationId, context.actor, client);
    assertFrom(application, ['information_required'], 'NTIC has not asked for more information on this application');
    await statusHistory.transition(client, {
      applicationId, from: 'information_required', to: 'under_review', actorId: context.actor.id,
      reason: message || 'Parent says the requested information has been provided',
      publicNote: 'You sent the requested information',
    });
    await auditService.record(auditEvent(context, 'application.information_provided', applicationId, {
      applicationNumber: application.applicationNumber,
    }), { client });
  });
  return getStatusForParent(applicationId, context.actor);
}

async function withdraw(applicationId, input, context) {
  const { reason } = validate(withdrawSchema, input);
  await withTransaction(async (client) => {
    const application = await lockForParent(applicationId, context.actor, client);
    assertFrom(application, ['submitted', 'under_review', 'information_required', 'decision_pending', 'waitlisted', 'offered'],
      'This application can no longer be withdrawn');
    if (application.status === 'offered') {
      const offer = await repo.lockPendingOffer(applicationId, client);
      if (offer) await repo.setOfferResponse(offer.id, 'declined', client);
    }
    await statusHistory.transition(client, {
      applicationId, from: application.status, to: 'withdrawn', actorId: context.actor.id, reason,
      publicNote: 'You withdrew this application',
    });
    await auditService.record(auditEvent(context, 'application.withdraw', applicationId, {
      applicationNumber: application.applicationNumber, from: application.status, reason,
    }), { client });
  });
  return getStatusForParent(applicationId, context.actor);
}

// accept = true / false. If the deadline has passed, the offer expires (that part IS saved), then the parent is told.
async function respondToOffer(applicationId, accept, context) {
  let expired = false;
  await withTransaction(async (client) => {
    const application = await lockForParent(applicationId, context.actor, client);
    assertFrom(application, ['offered'], 'There is no open offer on this application');
    const offer = await repo.lockPendingOffer(applicationId, client);
    if (!offer) throw new AppError('There is no open offer on this application', 409, 'INVALID_STATE');

    if (offer.isPast) {
      expired = true;
      await repo.setOfferResponse(offer.id, 'expired', client);
      await statusHistory.transition(client, {
        applicationId, from: 'offered', to: 'closed', actorId: null, reason: 'Offer expired without a response',
        publicNote: 'The offer expired because no response was received by the deadline',
      });
      return;
    }
    await repo.setOfferResponse(offer.id, accept ? 'accepted' : 'declined', client);
    await statusHistory.transition(client, {
      applicationId, from: 'offered', to: 'closed', actorId: context.actor.id,
      reason: accept ? 'Offer accepted by parent' : 'Offer declined by parent',
      publicNote: accept ? 'You accepted the offer' : 'You declined the offer',
    });
    await auditService.record(auditEvent(context, accept ? 'offer.accept' : 'offer.decline', applicationId, {
      applicationNumber: application.applicationNumber,
    }), { client });
  });
  if (expired) {
    throw new AppError('The deadline for this offer has passed and the offer has expired. Please contact NTIC.', 409, 'OFFER_EXPIRED');
  }
  return getStatusForParent(applicationId, context.actor);
}

// What a parent sees: status, a plain timeline, and the public part of the latest decision. Never internal notes.
async function getStatusForParent(applicationId, parent) {
  assertUuid(applicationId, 'Application id');
  const owner = await repo.findOwnerAndStatus(applicationId);
  if (!owner || owner.parentUserId !== parent.id) throw AppError.notFound('Application not found');
  const [timeline, decisions] = await Promise.all([repo.listTimelineForParent(applicationId), repo.listDecisions(applicationId)]);
  const latest = decisions[0];
  // While the fee is unpaid, the portal shows "pay by <date>"
  const { unpaid_expiry_days: days } = await settingsService.getValues();
  const paymentDeadline = owner.status === 'submitted' ? await jobsRepo.findPaymentDeadline(applicationId, days) : null;
  return {
    status: owner.status,
    paymentDeadline,
    timeline,
    decision: latest
      ? {
          outcome: latest.outcome,
          message: latest.publicMessage,
          offerDeadline: latest.offerDeadline,
          response: latest.response,
          decidedAt: latest.decidedAt,
        }
      : null,
  };
}

module.exports = {
  listApplications, getApplicationForStaff, requestInformation, sendForDecision, decide, reopen,
  respondToInformationRequest, withdraw, respondToOffer, getStatusForParent,
};
