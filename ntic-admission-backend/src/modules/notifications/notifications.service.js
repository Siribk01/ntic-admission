// src/modules/notifications/notifications.service.js
// Queueing emails (called by other modules) and sending them (called by the worker).

const repo = require('./notifications.repository');
const { render, SENSITIVE_TEMPLATES } = require('./notifications.templates');
const { getMailer } = require('./mail');
const emailTemplates = require('../emailTemplates/emailTemplates.service');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const AppError = require('../../utils/AppError');
const { z } = require('zod');

// Wait this many minutes before attempt 2, 3, 4, 5. After the 5th failure the email is marked "failed" for a person to look at.
const RETRY_MINUTES = [1, 5, 30, 120];
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;

// Called inside the SAME transaction as the business change. If that transaction rolls back, the email disappears with it,
// so a parent can never be told about something that did not happen.
async function queueForApplication(client, applicationId, template, extra = {}) {
  const context = await repo.findContext(applicationId, client);
  if (!context) return;
  const { recipientEmail, ...fields } = context;
  const rendered = render(template, { ...fields, ...extra }, await emailTemplates.activeOverride(template));
  await repo.insert({ applicationId, recipientEmail, template, ...rendered }, client);
}

// The same, for an email about the person's account (verification, password reset): there is no application involved
async function queueForUser(client, userId, template, extra = {}) {
  const context = await repo.findUserContext(userId, client);
  if (!context) return;
  const rendered = render(template, { ...context, ...extra });
  await repo.insert({ applicationId: null, recipientEmail: context.recipientEmail, template, ...rendered }, client);
}

// ---------- sending ----------

// Sends one due email. Returns false when there was nothing to do.
async function sendNextDue() {
  const mailer = getMailer();
  if (mailer.mode === 'disabled') return false;

  return withTransaction(async (client) => {
    const next = await repo.lockNextDue(client);
    if (!next) return false;
    try {
      await mailer.send({ to: next.to, subject: next.subject, text: next.text, html: next.html });
      await repo.markSent(next.id, client);
      if (SENSITIVE_TEMPLATES.has(next.template)) await repo.scrubBody(next.id, client);
    } catch (err) {
      const attempts = next.attempts + 1;
      await repo.markFailedAttempt(
        next.id,
        { attempts, retryInMinutes: attempts >= MAX_ATTEMPTS ? null : RETRY_MINUTES[attempts - 1], error: String(err.message).slice(0, 300) },
        client
      );
    }
    return true;
  });
}

// Sends everything that is due, up to a limit per round so one round cannot run forever
async function processDue(limit = 25) {
  let sent = 0;
  for (let i = 0; i < limit; i += 1) {
    if (!(await sendNextDue())) break;
    sent += 1;
  }
  return sent;
}

// ---------- admin ----------

const listSchema = z
  .object({
    status: z.enum(['pending', 'sent', 'failed'], { error: 'Status must be pending, sent or failed' }).optional(),
    limit: z.coerce.number({ error: 'limit must be a number' }).int().min(1).max(100).default(25),
  })
  .strict();

async function listNotifications(query) {
  const filters = validate(listSchema, query);
  const [items, counts] = await Promise.all([repo.list(filters), repo.counts()]);
  return { mode: getMailer().mode, counts, items };
}

async function retryNotification(id, context) {
  assertUuid(id, 'Notification id');
  await withTransaction(async (client) => {
    if (!(await repo.retryFailed(id, client))) {
      throw new AppError('Only a failed notification can be retried', 409, 'INVALID_STATE');
    }
    await auditService.record(
      { actor: context.actor, action: 'notification.retry', resourceType: 'notification', resourceId: id, ip: context.ip, userAgent: context.userAgent },
      { client }
    );
  });
  return { id, status: 'pending' };
}

module.exports = { queueForApplication, queueForUser, sendNextDue, processDue, listNotifications, retryNotification, MAX_ATTEMPTS };
