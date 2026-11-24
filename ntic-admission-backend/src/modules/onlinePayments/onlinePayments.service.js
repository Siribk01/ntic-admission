// src/modules/onlinePayments/onlinePayments.service.js
// Paying the application fee online, and telling the school about a bank transfer.
//
// THE RULE: a payment is recorded only after OUR SERVER has asked the gateway "was this paid, and how much?" and got a
// confirmed answer that matches what we expected. A redirect back to the website, or a webhook message, only tells us WHEN
// to ask. They are never believed on their own.
//
// Lock order: application -> attempt (or claim). The same order the rest of the system uses.

const crypto = require('crypto');
const repo = require('./onlinePayments.repository');
const paymentsRepo = require('../payments/payments.repository');
const paymentsService = require('../payments/payments.service');
const settingsService = require('../settings/settings.service');
const auditService = require('../audit/audit.service');
const notifications = require('../notifications/notifications.service');
const { activeGateway, forProvider } = require('./gateways');
const { GatewayError } = require('./gateways/http');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { formatMajor } = require('../../utils/money');
const { getCampusScope } = require('../../utils/campusScope');
const AppError = require('../../utils/AppError');
const { LIVE_STATUSES } = require('../../constants/applicationStatus');
const {
  initiateSchema, claimSchema, rejectClaimSchema, listAttemptsSchema, listClaimsSchema,
} = require('./onlinePayments.validation');

const MAX_ATTEMPTS_PER_DAY = 10;
const MAX_PENDING_CLAIMS = 3;
const REUSE_WINDOW_MINUTES = 30;
const RECONCILE_AFTER_MINUTES = 5;
const ABANDON_AFTER_DAYS = 3;
const MAX_WEBHOOK_TRIES = 8;

const inScope = (scope, campusId) => !scope || scope.includes(campusId);
const withMajor = (row) => ({ ...row, amount: formatMajor(row.amountMinor) });
const auditEvent = (context, action, resourceType, resourceId, metadata) => ({
  actor: context.actor, action, resourceType, resourceId, ip: context.ip, userAgent: context.userAgent, metadata,
});
// Work done on the parent's behalf by the system (a gateway message, a background check) is recorded under the parent
const systemContext = (attempt, source) => ({ actor: { id: attempt.initiatedBy, role: 'applicant' }, ip: null, userAgent: `system:${source}` });

// ===================== what a parent may see =====================

const PARENT_MESSAGES = {
  initiated: 'Waiting for confirmation from the payment provider.',
  successful: 'Payment received. Thank you.',
  failed: 'The payment was not completed. You have not been charged for this attempt. You can try again.',
  abandoned: 'This payment was not completed.',
  under_review: 'We received your payment and our team is checking it. You do not need to pay again.',
};

function presentAttemptForParent(a) {
  const status = a.status === 'needs_review' ? 'under_review' : a.status;
  return {
    reference: a.reference, status, amount: formatMajor(a.amountMinor), currency: a.currency,
    receiptNumber: a.receiptNumber || null, createdAt: a.createdAt, completedAt: a.completedAt, message: PARENT_MESSAGES[status],
  };
}

async function requireOwner(applicationId, parent) {
  assertUuid(applicationId, 'Application id');
  if (!(await repo.findApplicationOwner(applicationId, parent.id))) throw AppError.notFound('Application not found');
}

async function ownedAttempt(applicationId, reference, parent) {
  await requireOwner(applicationId, parent);
  const attempt = await repo.findAttemptByReference(String(reference).slice(0, 100));
  if (!attempt || attempt.applicationId !== applicationId) throw AppError.notFound('Payment not found');
  return attempt;
}

// ===================== starting a payment =====================

async function initiatePayment(applicationId, input, parent) {
  assertUuid(applicationId, 'Application id');
  const data = validate(initiateSchema, input || {});
  const gateway = activeGateway();
  const settings = await settingsService.getValues();
  if (!gateway || !settings.online_payments_enabled) {
    throw new AppError('Online payments are not available right now. You can pay by bank transfer instead.', 503, 'PAYMENTS_DISABLED');
  }

  // Step 1 (in the database): check the application, work out the amount, and record that we are about to ask the gateway
  const started = await withTransaction(async (client) => {
    const application = await repo.lockApplicationForParent(applicationId, parent.id, client);
    if (!application) throw AppError.notFound('Application not found');
    if (!LIVE_STATUSES.includes(application.status)) throw new AppError('Payments can only be made for submitted applications', 409, 'INVALID_STATE');

    const { remaining } = await paymentsService.balanceOf(client, application);
    if (remaining <= 0) throw new AppError('This application has already been paid in full', 409, 'ALREADY_PAID');
    const amountMinor = data.amount ?? remaining;
    if (amountMinor > remaining) {
      throw AppError.validation([{ field: 'amount', message: `Amount is more than the balance. The balance is ${formatMajor(remaining)} ${application.feeCurrency}` }]);
    }

    const reusable = await repo.findReusableAttempt({ applicationId, amountMinor, withinMinutes: REUSE_WINDOW_MINUTES }, client);
    if (reusable && reusable.provider === gateway.name) return { reuse: reusable, application };

    if ((await repo.countAttemptsSince(applicationId, 24, client)) >= MAX_ATTEMPTS_PER_DAY) {
      throw new AppError('Too many payment attempts today. Please try again tomorrow, or pay by bank transfer.', 429, 'RATE_LIMITED');
    }
    const reference = `NTICPAY-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
    const id = await repo.insertAttempt({ applicationId, provider: gateway.name, reference, amountMinor, currency: application.feeCurrency, initiatedBy: parent.id }, client);
    return { id, reference, amountMinor, application };
  });

  if (started.reuse) {
    const r = started.reuse;
    return { reference: r.reference, amount: formatMajor(r.amountMinor), currency: r.currency, authorizationUrl: r.authorizationUrl, status: 'initiated', reused: true };
  }

  // Step 2 (outside any transaction, so a slow gateway never holds a database lock): ask the gateway for a payment page
  const { id, reference, amountMinor, application } = started;
  const callbackUrl = `${process.env.PORTAL_URL || 'http://localhost:5173'}/payment/complete`;
  let authorizationUrl;
  try {
    ({ authorizationUrl } = await gateway.initialize({
      reference, amountMinor, currency: application.feeCurrency, email: application.parentEmail, name: application.candidate, callbackUrl,
      metadata: { applicationNumber: application.applicationNumber },
    }));
  } catch (err) {
    console.error(`Could not start online payment ${reference}:`, err.message);
    await withTransaction((client) => repo.finishAttempt(id, { status: 'failed', gatewayStatus: 'could_not_start' }, client));
    throw new AppError('We could not start the payment. Please try again in a moment, or pay by bank transfer.', 502, 'PAYMENT_GATEWAY');
  }

  await withTransaction(async (client) => {
    await repo.setAuthorizationUrl(id, authorizationUrl, client);
    await auditService.record(auditEvent({ actor: parent }, 'payment.online_start', 'payment_attempt', id, {
      applicationNumber: application.applicationNumber, reference, amountMinor, provider: gateway.name,
    }), { client });
  });
  return { reference, amount: formatMajor(amountMinor), currency: application.feeCurrency, authorizationUrl, status: 'initiated' };
}

async function getAttemptForParent(applicationId, reference, parent) {
  return presentAttemptForParent(await ownedAttempt(applicationId, reference, parent));
}

async function listAttemptsForParent(applicationId, parent) {
  await requireOwner(applicationId, parent);
  return (await repo.listAttemptsForParent(applicationId)).map(presentAttemptForParent);
}

// The parent's browser came back from the payment page: check with the gateway now rather than wait for the webhook
async function verifyForParent(applicationId, reference, parent) {
  const attempt = await ownedAttempt(applicationId, reference, parent);
  try {
    await settleAttempt(attempt.reference, { source: 'return' });
  } catch (err) {
    if (!(err instanceof GatewayError)) throw err;
    // The gateway is slow or down. The payment will still be picked up later by the webhook or the background check.
    console.error(`Verify of ${attempt.reference} failed:`, err.message);
  }
  return presentAttemptForParent(await repo.findAttemptByReference(attempt.reference));
}

// ===================== settling a payment (the heart of it) =====================

// Asks the gateway about a payment and, if it was really paid in full, records it. Safe to call any number of times, from
// anywhere, even at the same moment: the application lock and the one-payment-per-attempt rule see to that.
// Returns { outcome, attempt }. Throws GatewayError if the gateway could not be asked (callers may retry later).
async function settleAttempt(reference, { source }) {
  const attempt = await repo.findAttemptByReference(reference);
  if (!attempt) return { outcome: 'unknown_reference', attempt: null };
  if (['successful', 'failed', 'abandoned'].includes(attempt.status)) return { outcome: attempt.status, attempt };

  const gateway = forProvider(attempt.provider);
  if (!gateway || !gateway.isConfigured()) throw new GatewayError(`The ${attempt.provider} gateway is not configured`, { transient: true });
  const result = await gateway.verify(reference); // outside any transaction

  const outcome = await withTransaction(async (client) => {
    const application = await paymentsRepo.lockApplication({ applicationId: attempt.applicationId }, client);
    const locked = await repo.lockAttempt(attempt.id, client);
    if (['successful', 'failed', 'abandoned'].includes(locked.status)) return locked.status; // someone else finished it first
    const context = systemContext(attempt, source);
    const gatewayFacts = { gatewayStatus: result.gatewayStatus, gatewayId: result.gatewayId, paidAt: result.paidAt };

    if (result.status === 'failed') {
      await repo.finishAttempt(attempt.id, { status: 'failed', ...gatewayFacts }, client);
      return 'failed';
    }
    if (result.status !== 'success') return 'pending'; // not paid yet (or the gateway has never heard of it): leave it open

    // Money has moved. Now decide whether we can credit it automatically.
    const review = async (reason) => {
      await repo.finishAttempt(attempt.id, { status: 'needs_review', reviewReason: reason, ...gatewayFacts }, client);
      await auditService.record(auditEvent(context, 'payment.online_review', 'payment_attempt', attempt.id, { reference, reason, source }), { client });
      return 'needs_review';
    };
    if (result.amountMinor !== attempt.amountMinor || result.currency !== attempt.currency) {
      return review(`The gateway reports ${result.amountMinor} ${result.currency} (minor units) but we expected ${attempt.amountMinor} ${attempt.currency}`);
    }
    if (!LIVE_STATUSES.includes(application.status)) {
      return review(`The money was taken but the application is no longer open for payment (status: ${application.status})`);
    }
    const { remaining } = await paymentsService.balanceOf(client, application);
    if (remaining < attempt.amountMinor) {
      return review(`The money was taken but only ${formatMajor(Math.max(remaining, 0))} ${application.feeCurrency} of the fee was still unpaid (paid another way meanwhile?)`);
    }

    const { id: paymentId } = await paymentsService.recordPaymentTx(
      client, application,
      { amountMinor: attempt.amountMinor, method: 'online', bankReference: reference, paidAt: result.paidAt, provider: attempt.provider, attemptId: attempt.id },
      attempt.initiatedBy
    );
    await repo.finishAttempt(attempt.id, { status: 'successful', paymentId, ...gatewayFacts }, client);
    await auditService.record(auditEvent(context, 'payment.online_settled', 'payment', paymentId, {
      applicationNumber: application.applicationNumber, reference, amountMinor: attempt.amountMinor, provider: attempt.provider, source,
    }), { client });
    return 'successful';
  });
  return { outcome, attempt: await repo.findAttemptByReference(reference) };
}

// ===================== messages from the gateway =====================

// Returns { httpStatus, body } for the webhook route to send back. A non-200 answer makes the gateway try again later.
async function handleWebhook(providerName, rawBody, headers) {
  const gateway = forProvider(providerName);
  if (!gateway || !gateway.isConfigured()) return { httpStatus: 404, body: { error: { message: 'Not found', code: 'NOT_FOUND' } } };
  if (!Buffer.isBuffer(rawBody)) {
    // The body was already parsed as JSON by something earlier, so the exact bytes the signature covers are gone
    console.error('Webhook received without its raw body. Mount /webhooks BEFORE express.json() in app.js.');
    return { httpStatus: 500, body: { error: { message: 'Server is not set up to read webhooks', code: 'MISCONFIGURED' } } };
  }
  if (!gateway.verifyWebhook(rawBody, headers)) return { httpStatus: 401, body: { error: { message: 'Invalid signature', code: 'UNAUTHORIZED' } } };

  let json;
  try { json = JSON.parse(rawBody.toString('utf8')); } catch { return { httpStatus: 400, body: { error: { message: 'Invalid JSON', code: 'BAD_REQUEST' } } }; }
  const parsed = gateway.parseWebhook(json);
  const eventId = parsed.eventId || `hash:${crypto.createHash('sha256').update(rawBody).digest('hex')}`;

  let eventRowId;
  const inserted = await repo.insertEvent({ provider: providerName, eventId, type: parsed.type, reference: parsed.reference, payload: json });
  if (inserted) eventRowId = inserted.id;
  else {
    const existing = await repo.findEvent(providerName, eventId);
    if (existing.status === 'processed' || existing.status === 'ignored') return { httpStatus: 200, body: { received: true, duplicate: true } };
    eventRowId = existing.id; // an earlier try failed: try again now
  }

  if (!parsed.reference) {
    await repo.markEvent(eventRowId, 'ignored');
    return { httpStatus: 200, body: { received: true, ignored: true } };
  }
  try {
    const { outcome } = await settleAttempt(parsed.reference, { source: 'webhook' });
    await repo.markEvent(eventRowId, outcome === 'unknown_reference' ? 'ignored' : 'processed');
    return { httpStatus: 200, body: { received: true } };
  } catch (err) {
    console.error(`Webhook ${providerName}/${eventId} failed:`, err.message);
    await repo.markEvent(eventRowId, 'failed', err.message);
    return { httpStatus: 500, body: { error: { message: 'Could not process yet. Please retry.', code: 'RETRY' } } };
  }
}

// ===================== background check (job: reconcile_payments) =====================

// Catches everything a lost webhook or a closed browser tab left behind
async function reconcile() {
  const total = { processed: 0, failed: 0, error: null };
  const note = (err) => { total.failed += 1; total.error = err.message; console.error('Reconcile error:', err.message); };
  const { query } = require('../../db/pool');
  const db = { query };

  for (const row of await repo.findOpenAttempts(db, { olderThanMinutes: RECONCILE_AFTER_MINUTES, limit: 50 })) {
    try {
      const { outcome } = await settleAttempt(row.reference, { source: 'reconcile' });
      if (outcome === 'successful' || outcome === 'failed') total.processed += 1;
      // Nobody paid after several days: stop checking
      if (outcome === 'pending' && Date.now() - new Date(row.createdAt).getTime() > ABANDON_AFTER_DAYS * 864e5) {
        await withTransaction(async (client) => {
          const a = await repo.lockAttempt((await repo.findAttemptByReference(row.reference)).id, client);
          if (a.status === 'initiated') { await repo.finishAttempt(a.id, { status: 'abandoned', gatewayStatus: 'not_paid' }, client); total.processed += 1; }
        });
      }
    } catch (err) { note(err); }
  }

  for (const event of await repo.findRetryableEvents(db, { olderThanMinutes: RECONCILE_AFTER_MINUTES, maxTries: MAX_WEBHOOK_TRIES, limit: 50 })) {
    try {
      if (!event.reference) { await repo.markEvent(event.id, 'ignored'); continue; }
      const { outcome } = await settleAttempt(event.reference, { source: 'reconcile' });
      await repo.markEvent(event.id, outcome === 'unknown_reference' ? 'ignored' : 'processed');
      total.processed += 1;
    } catch (err) { await repo.markEvent(event.id, 'failed', err.message); note(err); }
  }
  return total;
}

async function reconcileStatus() {
  const { query } = require('../../db/pool');
  const db = { query };
  return {
    toCheck: await repo.countOpenAttempts(db, { olderThanMinutes: RECONCILE_AFTER_MINUTES }),
    needReview: await repo.countNeedingReview(db),
  };
}

// ===================== staff: online payments =====================

async function listAttemptsForStaff(query, actor) {
  const f = validate(listAttemptsSchema, query);
  const rows = await repo.listAttemptsForStaff({ status: f.status, campusScope: await getCampusScope(actor), limit: Math.min(Number(f.limit) || 50, 200) });
  return rows.map(({ authorizationUrl, initiatedBy, ...rest }) => withMajor(rest));
}

// Re-check one attempt with the gateway, for example after an administrator reopened an expired application
async function settleForStaff(attemptId, context) {
  assertUuid(attemptId, 'Payment attempt id');
  const attempt = await repo.findAttemptById(attemptId);
  if (!attempt || !inScope(await getCampusScope(context.actor), attempt.campusId)) throw AppError.notFound('Payment attempt not found');
  try {
    await settleAttempt(attempt.reference, { source: 'staff' });
  } catch (err) {
    if (err instanceof GatewayError) throw new AppError('The payment provider could not be reached. Try again shortly.', 502, 'PAYMENT_GATEWAY');
    throw err;
  }
  await withTransaction((client) => auditService.record(auditEvent(context, 'payment.online_recheck', 'payment_attempt', attemptId, { reference: attempt.reference }), { client }));
  const { authorizationUrl, initiatedBy, ...rest } = await repo.findAttemptById(attemptId);
  return withMajor(rest);
}

// ===================== bank transfer claims =====================

const presentClaim = (c) => withMajor(c);

async function submitClaim(applicationId, input, parent) {
  assertUuid(applicationId, 'Application id');
  const data = validate(claimSchema, input);

  let claimId;
  try {
    claimId = await withTransaction(async (client) => {
      const application = await repo.lockApplicationForParent(applicationId, parent.id, client);
      if (!application) throw AppError.notFound('Application not found');
      if (!LIVE_STATUSES.includes(application.status)) throw new AppError('Payments can only be made for submitted applications', 409, 'INVALID_STATE');
      const { remaining } = await paymentsService.balanceOf(client, application);
      if (remaining <= 0) throw new AppError('This application has already been paid in full', 409, 'ALREADY_PAID');
      if (data.amount > remaining) {
        throw AppError.validation([{ field: 'amount', message: `Amount is more than the balance. The balance is ${formatMajor(remaining)} ${application.feeCurrency}` }]);
      }
      if ((await repo.countPendingClaims(applicationId, client)) >= MAX_PENDING_CLAIMS) {
        throw new AppError('You already have payment details waiting to be checked. Please wait for the school to confirm them.', 409, 'TOO_MANY_PENDING');
      }
      if (await repo.referenceAlreadyPaid(data.bankReference, client)) {
        throw AppError.conflict('This bank reference has already been recorded. If you need help, please contact the school.');
      }
      const id = await repo.insertClaim({
        applicationId, amountMinor: data.amount, currency: application.feeCurrency, bankReference: data.bankReference,
        bankName: data.bankName, paidOn: data.paidOn, note: data.note, submittedBy: parent.id,
      }, client);
      await notifications.queueForApplication(client, applicationId, 'payment_claim_received', {
        bankReference: data.bankReference, amountMinor: data.amount, currency: application.feeCurrency,
      });
      await auditService.record(auditEvent({ actor: parent }, 'payment.claim_submit', 'payment_claim', id, {
        applicationNumber: application.applicationNumber, amountMinor: data.amount, bankReference: data.bankReference,
      }), { client });
      return id;
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'payment_claims_reference_uq') {
      throw AppError.conflict('You have already sent these payment details for this application');
    }
    throw err;
  }
  return presentClaim(await repo.findClaim(claimId));
}

async function listClaimsForParent(applicationId, parent) {
  await requireOwner(applicationId, parent);
  return (await repo.listClaimsForParent(applicationId)).map(presentClaim);
}

async function listClaimsForStaff(query, actor) {
  const f = validate(listClaimsSchema, query);
  const rows = await repo.listClaimsForStaff({ status: f.status, campusScope: await getCampusScope(actor), limit: Math.min(Number(f.limit) || 50, 200) });
  return rows.map(presentClaim);
}

// Reads the claim, finds its application, locks that, then locks the claim: the usual order
async function withClaim(claimId, context, work) {
  assertUuid(claimId, 'Claim id');
  const scope = await getCampusScope(context.actor);
  const claim = await repo.findClaim(claimId);
  if (!claim || !inScope(scope, claim.campusId)) throw AppError.notFound('Payment claim not found');

  await withTransaction(async (client) => {
    const application = await paymentsRepo.lockApplication({ applicationId: claim.applicationId }, client);
    const locked = await repo.lockClaim(claimId, client);
    if (locked.status !== 'pending') throw new AppError(`This claim has already been ${locked.status}`, 409, 'INVALID_STATE');
    await work(client, application, { ...claim, ...locked });
  });
  return presentClaim(await repo.findClaim(claimId));
}

// Finance has seen the money in the school account: the claim becomes a normal bank transfer payment
async function confirmClaim(claimId, context) {
  try {
    return await withClaim(claimId, context, async (client, application, claim) => {
      const { id: paymentId } = await paymentsService.recordPaymentTx(
        client, application,
        {
          amountMinor: claim.amountMinor, method: 'bank_transfer', bankReference: claim.bankReference,
          paidAt: `${claim.paidOn}T12:00:00+01:00`, note: `Confirmed from the parent's payment details${claim.bankName ? ` (${claim.bankName})` : ''}`,
        },
        context.actor.id
      );
      await repo.confirmClaim({ id: claim.id, reviewerId: context.actor.id, paymentId }, client);
      await auditService.record(auditEvent(context, 'payment.claim_confirm', 'payment_claim', claim.id, {
        applicationNumber: application.applicationNumber, paymentId, amountMinor: claim.amountMinor, bankReference: claim.bankReference,
      }), { client });
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'payments_bank_reference_uq') {
      throw AppError.conflict('A payment with this bank reference is already recorded. Reject this claim, or check the reference.');
    }
    throw err;
  }
}

async function rejectClaim(claimId, input, context) {
  const { reason } = validate(rejectClaimSchema, input);
  return withClaim(claimId, context, async (client, application, claim) => {
    await repo.rejectClaim({ id: claim.id, reviewerId: context.actor.id, reason }, client);
    await notifications.queueForApplication(client, application.id, 'payment_claim_rejected', { bankReference: claim.bankReference, reason });
    await auditService.record(auditEvent(context, 'payment.claim_reject', 'payment_claim', claim.id, {
      applicationNumber: application.applicationNumber, bankReference: claim.bankReference, reason,
    }), { client });
  });
}

module.exports = {
  initiatePayment, getAttemptForParent, listAttemptsForParent, verifyForParent,
  settleAttempt, handleWebhook, reconcile, reconcileStatus, listAttemptsForStaff, settleForStaff,
  submitClaim, listClaimsForParent, listClaimsForStaff, confirmClaim, rejectClaim,
};
