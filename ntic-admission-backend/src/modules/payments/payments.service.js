// src/modules/payments/payments.service.js
// Recording and reversing payments, and showing receipts.

const repo = require('./payments.repository');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { formatMajor } = require('../../utils/money');
const { getCampusScope } = require('../../utils/campusScope');
const AppError = require('../../utils/AppError');
const statusHistory = require('../../utils/statusHistory');
const notifications = require('../notifications/notifications.service');
const { LIVE_STATUSES } = require('../../constants/applicationStatus');
const { ROLES } = require('../../constants/roles');
const { createPaymentSchema, reversePaymentSchema, listPaymentsSchema } = require('./payments.validation');

const withAmount = (payment) => ({ ...payment, amount: formatMajor(payment.amountMinor) });

const auditEvent = (context, action, resourceId, metadata) => ({
  actor: context.actor,
  action,
  resourceType: 'payment',
  resourceId,
  ip: context.ip,
  userAgent: context.userAgent,
  metadata,
});

// A campus officer or finance officer may only touch payments of their own campuses.
// An application from another campus is reported as "not found" so its existence is not revealed.
function assertInScope(scope, campusId) {
  if (scope && !scope.includes(campusId)) throw AppError.notFound('Application not found');
}

// How much of the fee is still unpaid. Call with the application row locked.
async function balanceOf(client, application) {
  const paid = await repo.sumSuccessful(application.id, client);
  return { paid, remaining: application.feeAmountMinor - paid };
}

// The one place a payment is written, whoever it came from (staff, a gateway, a confirmed claim, a waiver).
// MUST be called inside a transaction with the application row locked, so two payments cannot both fit the same balance.
// It saves the payment, moves a fully paid application to "under review", and queues the parent's receipt email.
async function recordPaymentTx(client, application, p, actorId) {
  if (!LIVE_STATUSES.includes(application.status)) {
    throw new AppError('Payments can only be recorded for submitted applications', 409, 'INVALID_STATE');
  }
  const { paid: alreadyPaid, remaining } = await balanceOf(client, application);
  if (remaining <= 0) throw new AppError('This application has already been paid in full', 409, 'ALREADY_PAID');
  if (p.amountMinor > remaining) {
    throw AppError.validation([
      { field: 'amount', message: `Amount is more than the balance. The balance is ${formatMajor(remaining)} ${application.feeCurrency}` },
    ]);
  }

  const id = await repo.insert(
    {
      applicationId: application.id, amountMinor: p.amountMinor, currency: application.feeCurrency, method: p.method,
      bankReference: p.bankReference, paidAt: p.paidAt, recordedBy: actorId, note: p.note, provider: p.provider, attemptId: p.attemptId,
    },
    client
  );

  // SRS 3.1: a fully paid application moves from Submitted to Under Review automatically
  const paidInFull = alreadyPaid + p.amountMinor >= application.feeAmountMinor;
  if (application.status === 'submitted' && paidInFull) {
    await statusHistory.transition(client, {
      applicationId: application.id, from: 'submitted', to: 'under_review',
      actorId, reason: p.method === 'waiver' ? 'Application fee waived' : 'Application fee paid in full',
    });
  }

  const receipt = await repo.findById(id, client);
  await notifications.queueForApplication(client, application.id, 'payment_received', {
    receiptNumber: receipt.receiptNumber, amountMinor: p.amountMinor, currency: application.feeCurrency,
    method: p.method, paidInFull, balanceMinor: application.feeAmountMinor - alreadyPaid - p.amountMinor,
  });
  return { id, receiptNumber: receipt.receiptNumber, paidInFull };
}

async function createPayment(input, context) {
  const data = validate(createPaymentSchema, input);
  const scope = await getCampusScope(context.actor);
  // Waiving a fee is the central administration's decision, not the finance desk's
  if (data.method === 'waiver' && context.actor.role !== ROLES.CENTRAL_ADMIN) {
    throw new AppError('Only a central administrator can waive a fee', 403, 'FORBIDDEN');
  }

  let paymentId;
  try {
    paymentId = await withTransaction(async (client) => {
      const application = await repo.lockApplication(data, client);
      if (!application) throw AppError.notFound('Application not found');
      assertInScope(scope, application.campusId);

      const { id } = await recordPaymentTx(
        client, application,
        { amountMinor: data.amount, method: data.method, bankReference: data.bankReference, paidAt: data.paidAt, note: data.note },
        context.actor.id
      );
      await auditService.record(
        auditEvent(context, data.method === 'waiver' ? 'payment.waive' : 'payment.record', id, {
          applicationNumber: application.applicationNumber, amountMinor: data.amount, method: data.method,
          bankReference: data.bankReference ?? null, ...(data.method === 'waiver' ? { reason: data.note } : {}),
        }),
        { client }
      );
      return id;
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'payments_bank_reference_uq') {
      throw AppError.conflict('This bank reference has already been recorded');
    }
    throw err;
  }
  return withAmount(await repo.findById(paymentId));
}

async function reversePayment(paymentId, input, context) {
  assertUuid(paymentId, 'Payment id');
  const { reason } = validate(reversePaymentSchema, input);

  await withTransaction(async (client) => {
    const payment = await repo.lockById(paymentId, client);
    if (!payment) throw AppError.notFound('Payment not found');
    if (payment.status !== 'successful') {
      throw new AppError('This payment has already been reversed', 409, 'INVALID_STATE');
    }
    await repo.markReversed(paymentId, context.actor.id, reason, client);
    await auditService.record(auditEvent(context, 'payment.reverse', paymentId, { reason }), { client });
  });
  return withAmount(await repo.findById(paymentId));
}

async function listPaymentsForStaff(query, actor) {
  const filters = validate(listPaymentsSchema, query);
  const campusScope = await getCampusScope(actor);
  const rows = await repo.listForStaff({ ...filters, campusScope });
  return rows.map(withAmount);
}

async function listMyPayments(query, parent) {
  const filters = validate(listPaymentsSchema, query);
  const rows = await repo.listForParent({ parentUserId: parent.id, ...filters });
  // A parent does not need to see which staff member recorded it
  return rows.map(({ recordedBy, ...rest }) => withAmount(rest));
}

module.exports = { createPayment, reversePayment, listPaymentsForStaff, listMyPayments, recordPaymentTx, balanceOf, withAmount };
