// src/modules/jobs/jobs.service.js
// The three background jobs, written so that running them twice, or on two servers at once, does no harm:
//   expire_unpaid  - closes submitted applications whose fee was not paid by the deadline (FR-055, BR-013)
//   expire_offers  - closes offers that were not answered by their deadline
//   send_reminders - payment deadline, offer deadline, exam and interview reminders, each sent once
//
// The pattern for every item: LOOK (cheap query, no locks) -> LOCK that one application -> CHECK AGAIN under the lock
// -> change it in its own small transaction. A payment, a withdrawal or another server that got there first simply
// makes the re-check say "nothing to do". One bad application never stops the others.

const repo = require('./jobs.repository');
const settingsService = require('../settings/settings.service');
const decisionsRepo = require('../decisions/decisions.repository');
const notifications = require('../notifications/notifications.service');
const onlinePayments = require('../onlinePayments/onlinePayments.service');
const auditService = require('../audit/audit.service');
const statusHistory = require('../../utils/statusHistory');
const { withTransaction, query } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const { LIVE_STATUSES } = require('../../constants/applicationStatus');
const { runSchema } = require('./jobs.validation');

// Reminder emails are only sent in the daytime (Lagos), so nobody is emailed at 2 a.m. Expiry has no such limit.
const REMINDER_FROM_HOUR = 7;
const REMINDER_TO_HOUR = 20; // up to 19:59

const lagosHour = (date) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(date));
const isReminderHour = (date = new Date()) => {
  const hour = lagosHour(date);
  return hour >= REMINDER_FROM_HOUR && hour < REMINDER_TO_HOUR;
};

// Runs handler for every row. Returns how many changed something, how many failed, and the last error message.
async function eachRow(rows, handler) {
  let processed = 0;
  let failed = 0;
  let error = null;
  for (const row of rows) {
    try {
      if (await handler(row)) processed += 1;
    } catch (err) {
      failed += 1;
      error = err.message;
      console.error(`Background job error for application ${row.id}:`, err.message);
    }
  }
  return { processed, failed, error };
}

// ===================== expire_unpaid =====================

async function expireUnpaid(settings) {
  const days = settings.unpaid_expiry_days;
  const candidates = await repo.findExpirable({ query }, { days });
  return eachRow(candidates, (row) =>
    withTransaction(async (client) => {
      const application = await repo.lockApplication(row.id, client);
      if (!application) return false;
      // Re-check under the lock: a payment or withdrawal may have arrived a moment ago
      const [still] = await repo.findExpirable(client, { days, applicationId: row.id });
      if (!still) return false;
      await statusHistory.transition(client, {
        applicationId: row.id, from: 'submitted', to: 'closed', actorId: null,
        reason: `Expired: the application fee was not paid by ${still.deadline}`,
        publicNote: 'This application expired because the application fee was not paid by the deadline',
      });
      await notifications.queueForApplication(client, row.id, 'application_expired', { paymentDeadline: still.deadline });
      return true;
    })
  );
}

// ===================== expire_offers =====================

async function expireOffers() {
  const candidates = await repo.findExpirableOffers({ query }, {});
  return eachRow(candidates, (row) =>
    withTransaction(async (client) => {
      const application = await repo.lockApplication(row.id, client);
      if (!application || application.status !== 'offered') return false;
      // Same check the parent's accept/decline uses: the offer must still be open and its deadline must be past
      const offer = await decisionsRepo.lockPendingOffer(row.id, client);
      if (!offer || !offer.isPast) return false;
      await decisionsRepo.setOfferResponse(offer.id, 'expired', client);
      await statusHistory.transition(client, {
        applicationId: row.id, from: 'offered', to: 'closed', actorId: null,
        reason: 'Offer expired without a response',
        publicNote: 'The offer expired because no response was received by the deadline',
      });
      await notifications.queueForApplication(client, row.id, 'offer_expired', { offerDeadline: offer.offerDeadline });
      return true;
    })
  );
}

// ===================== send_reminders =====================

// Sends one reminder, once. "finder" re-checks under the lock that the reminder is still due and not yet sent;
// the unique reminder_log row is the final guard if two servers get here together.
function reminderHandler({ kind, template, finder, extraOf }) {
  return (row) =>
    withTransaction(async (client) => {
      if (!(await repo.lockApplication(row.id, client))) return false;
      const [still] = await finder(client, row.id);
      if (!still) return false;
      if (!(await repo.markReminderSent({ applicationId: row.id, kind, ref: still.ref }, client))) return false;
      await notifications.queueForApplication(client, row.id, template, extraOf(still));
      return true;
    });
}

async function sendReminders(settings, { respectReminderHours, now = new Date() }) {
  if (respectReminderHours && !isReminderHour(now)) {
    return { processed: 0, failed: 0, error: null, skipped: 'Outside reminder hours (07:00 to 20:00 Lagos time)' };
  }
  const total = { processed: 0, failed: 0, error: null };
  const add = (r) => {
    total.processed += r.processed;
    total.failed += r.failed;
    if (r.error) total.error = r.error;
  };

  const expiryDays = settings.unpaid_expiry_days;
  const warningDays = settings.unpaid_warning_days;
  if (warningDays > 0) {
    const finder = (db, applicationId) => repo.findPaymentWarnings(db, { days: expiryDays, warningDays, applicationId });
    add(await eachRow(await finder({ query }), reminderHandler({
      kind: 'unpaid_expiry_warning', template: 'unpaid_expiry_warning', finder,
      extraOf: (r) => ({ paymentDeadline: r.deadline }),
    })));
  }

  const offerDays = settings.offer_reminder_days;
  if (offerDays > 0) {
    const finder = (db, applicationId) => repo.findOfferReminders(db, { reminderDays: offerDays, applicationId });
    add(await eachRow(await finder({ query }), reminderHandler({
      kind: 'offer_reminder', template: 'offer_reminder', finder,
      extraOf: (r) => ({ offerDeadline: r.deadline }),
    })));
  }

  const examHours = settings.exam_reminder_hours;
  if (examHours > 0) {
    const finder = (db, applicationId) => repo.findExamReminders(db, { hours: examHours, liveStatuses: LIVE_STATUSES, applicationId });
    add(await eachRow(await finder({ query }), reminderHandler({
      kind: 'exam_reminder', template: 'exam_reminder', finder,
      extraOf: (r) => ({ examNumber: r.examNumber, startsAt: r.startsAt, venue: r.venue, campusName: r.campusName }),
    })));
  }

  const interviewHours = settings.interview_reminder_hours;
  if (interviewHours > 0) {
    const finder = (db, applicationId) => repo.findInterviewReminders(db, { hours: interviewHours, liveStatuses: LIVE_STATUSES, applicationId });
    add(await eachRow(await finder({ query }), reminderHandler({
      kind: 'interview_reminder', template: 'interview_reminder', finder,
      extraOf: (r) => ({ startsAt: r.startsAt, durationMinutes: r.durationMinutes, timezone: r.timezone, platform: r.platform, meetingUrl: r.meetingUrl, location: r.location, instructions: r.instructions }),
    })));
  }
  return total;
}

// ===================== running them =====================

const JOBS = {
  // First, so a payment that is already made is credited before anything can expire
  reconcile_payments: () => onlinePayments.reconcile(),
  expire_unpaid: (settings) => expireUnpaid(settings),
  expire_offers: () => expireOffers(),
  send_reminders: (settings, options) => sendReminders(settings, options),
};
const JOB_NAMES = Object.keys(JOBS);

// Runs the jobs one after the other: expiry first, so nobody is reminded about something that has just expired.
// respectReminderHours is true for the timer and false when an administrator presses "run now".
async function runJobs({ only, respectReminderHours = true, now = new Date() } = {}) {
  const names = only ? [only] : JOB_NAMES;
  const settings = await settingsService.getValues();
  const results = [];
  for (const job of names) {
    const startedAt = new Date();
    let outcome;
    try {
      outcome = await JOBS[job](settings, { respectReminderHours, now });
    } catch (err) {
      console.error(`Background job ${job} failed:`, err.message);
      outcome = { processed: 0, failed: 0, error: err.message };
    }
    let stateId = null;
    try {
      stateId = await repo.recordRun(job, { startedAt, processed: outcome.processed, error: outcome.error });
    } catch (err) {
      console.error(`Could not record the run of ${job}:`, err.message);
    }
    results.push({ job, stateId, ...outcome });
  }
  return results;
}

// Only one server (or one manual run) works at a time. Returns null when another run is in progress.
// The lock is a database advisory lock held by a transaction that does nothing else, so it is released on commit,
// or automatically if the server dies.
async function runExclusive(work) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT pg_try_advisory_xact_lock(hashtext('ntic_background_jobs')) AS locked`);
    if (!rows[0].locked) return null;
    return work();
  });
}

// ===================== admin =====================

async function runNow(input, context) {
  const { job } = validate(runSchema, input || {});
  const results = await runExclusive(() => runJobs({ only: job, respectReminderHours: false }));
  if (!results) throw new AppError('The background jobs are already running. Try again in a minute.', 409, 'INVALID_STATE');

  await withTransaction(async (client) => {
    for (const result of results) {
      if (!result.stateId) continue;
      await auditService.record({
        actor: context.actor, action: 'jobs.run_manual', resourceType: 'job', resourceId: result.stateId,
        ip: context.ip, userAgent: context.userAgent,
        metadata: { job: result.job, processed: result.processed, failed: result.failed },
      }, { client });
    }
  });
  return results.map(({ stateId, ...rest }) => rest);
}

// What has run, and what is waiting to be done right now (without doing it)
async function getStatus() {
  const settings = await settingsService.getValues();
  const db = { query };
  const none = Promise.resolve([]);
  const [state, expirable, offers, warnings, offerReminders, examReminders, interviewReminders, payments] = await Promise.all([
    // (the last entry of this list is the online payment counts)
    repo.listState(),
    repo.findExpirable(db, { days: settings.unpaid_expiry_days, limit: 1000 }),
    repo.findExpirableOffers(db, { limit: 1000 }),
    settings.unpaid_warning_days > 0
      ? repo.findPaymentWarnings(db, { days: settings.unpaid_expiry_days, warningDays: settings.unpaid_warning_days, limit: 1000 }) : none,
    settings.offer_reminder_days > 0
      ? repo.findOfferReminders(db, { reminderDays: settings.offer_reminder_days, limit: 1000 }) : none,
    settings.exam_reminder_hours > 0
      ? repo.findExamReminders(db, { hours: settings.exam_reminder_hours, liveStatuses: LIVE_STATUSES, limit: 1000 }) : none,
    settings.interview_reminder_hours > 0
      ? repo.findInterviewReminders(db, { hours: settings.interview_reminder_hours, liveStatuses: LIVE_STATUSES, limit: 1000 }) : none,
    onlinePayments.reconcileStatus(),
  ]);
  const byJob = Object.fromEntries(state.map((s) => [s.job, s]));
  return {
    reminderHours: `${String(REMINDER_FROM_HOUR).padStart(2, '0')}:00 to ${String(REMINDER_TO_HOUR).padStart(2, '0')}:00 Lagos time`,
    jobs: JOB_NAMES.map((job) => byJob[job] || { job, runs: 0, lastStartedAt: null, lastFinishedAt: null, lastProcessed: 0, lastError: null }),
    dueNow: {
      applicationsToExpire: expirable.length,
      offersToExpire: offers.length,
      paymentWarningsToSend: warnings.length,
      offerRemindersToSend: offerReminders.length,
      examRemindersToSend: examReminders.length,
      interviewRemindersToSend: interviewReminders.length,
      onlinePaymentsToCheck: payments.toCheck,
      onlinePaymentsNeedingReview: payments.needReview,
    },
  };
}

module.exports = { runJobs, runExclusive, runNow, getStatus, isReminderHour, JOB_NAMES };
