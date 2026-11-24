// src/modules/health/health.service.js
// "Is the system working?" in two forms:
//   liveness()  for load balancers and uptime monitors: answers only "ok" or "unavailable", reveals nothing.
//   report()    for central administrators: what is running, what is stuck, what needs attention. Never shows passwords or keys.
//
// Every check runs on its own inside a try/catch, so one broken check shows up as an error line instead of breaking the whole page.

const fs = require('fs');
const path = require('path');
const { query } = require('../../db/pool');

const MINUTE = 60 * 1000;
const ok = (message, details) => ({ status: 'ok', message, ...(details ? { details } : {}) });
const warning = (message, details) => ({ status: 'warning', message, ...(details ? { details } : {}) });
const error = (message, details) => ({ status: 'error', message, ...(details ? { details } : {}) });

const ago = (value) => {
  if (!value) return null;
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / MINUTE);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
};

async function liveness() {
  try {
    await query('SELECT 1');
    return { httpStatus: 200, body: { status: 'ok' } };
  } catch {
    return { httpStatus: 503, body: { status: 'unavailable' } };
  }
}

// ---------------------------------------------------------------- the checks

async function checkDatabase() {
  const started = Date.now();
  await query('SELECT 1');
  const ms = Date.now() - started;
  return ms > 1000 ? warning(`The database answered, but slowly (${ms} ms)`, { ms }) : ok(`The database answered in ${ms} ms`, { ms });
}

async function checkEmail() {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'failed')::int AS failed,
            count(*) FILTER (WHERE status = 'sent' AND sent_at > now() - interval '24 hours')::int AS "sentLast24h",
            min(created_at) FILTER (WHERE status = 'pending') AS "oldestPending",
            max(sent_at) AS "lastSent"
       FROM notifications`
  );
  const q = rows[0];
  const smtp = Boolean(process.env.SMTP_HOST);
  const details = { smtpConfigured: smtp, pending: q.pending, failed: q.failed, sentLast24h: q.sentLast24h, oldestPendingAgo: ago(q.oldestPending), lastSentAgo: ago(q.lastSent) };
  if (!smtp && process.env.NODE_ENV === 'production') return error('Email is not set up (SMTP_HOST is missing), so no email can be sent', details);
  if (q.oldestPending && Date.now() - new Date(q.oldestPending).getTime() > 30 * MINUTE) {
    return warning(`${q.pending} email(s) are waiting, the oldest for ${ago(q.oldestPending).replace(' ago', '')}. The email sender may be stuck`, details);
  }
  if (q.failed > 0) return warning(`${q.failed} email(s) failed permanently. Use POST /admin/notifications/:id/retry after fixing the cause`, details);
  return ok(smtp ? `Email is working (${q.sentLast24h} sent in the last 24 hours)` : 'Email is in development mode (SMTP_HOST is not set)', details);
}

async function checkJobs() {
  const scheduler = require('../jobs/jobs.scheduler');
  const { rows } = await query(`SELECT job, runs, last_finished_at AS "lastFinishedAt", last_error AS "lastError" FROM job_state ORDER BY job`);
  const details = { scheduled: scheduler.isScheduled(), jobs: rows.map((r) => ({ job: r.job, runs: r.runs, lastRan: ago(r.lastFinishedAt), lastError: r.lastError })) };
  const failing = rows.filter((r) => r.lastError);
  const newest = rows.reduce((m, r) => (r.lastFinishedAt && new Date(r.lastFinishedAt) > m ? new Date(r.lastFinishedAt) : m), new Date(0));
  if (!scheduler.isScheduled()) return warning('The background job scheduler is not running on this server instance (it may run on another one)', details);
  if (!rows.length || newest.getTime() === 0) return warning('The background jobs have not run yet', details);
  if (Date.now() - newest.getTime() > 20 * MINUTE) return error(`No background job has finished for ${ago(newest).replace(' ago', '')}. The scheduler looks stuck`, details);
  if (failing.length) return warning(`${failing.map((f) => f.job).join(', ')} reported an error on the last run`, details);
  return ok(`Background jobs are running (last finished ${ago(newest)})`, details);
}

async function checkPayments() {
  const { activeGateway } = require('../onlinePayments/gateways');
  const gateway = activeGateway();
  const { rows } = await query(
    `SELECT (SELECT count(*) FROM payment_attempts WHERE status = 'needs_review')::int AS "needReview",
            (SELECT count(*) FROM payment_attempts WHERE status = 'initiated' AND created_at < now() - interval '1 day')::int AS "stuckAttempts",
            (SELECT count(*) FROM webhook_events WHERE status = 'failed')::int AS "failedWebhooks",
            (SELECT count(*) FROM payment_claims WHERE status = 'pending')::int AS "claimsWaiting",
            (SELECT count(*) FROM payment_claims WHERE status = 'pending' AND created_at < now() - interval '3 days')::int AS "claimsOverdue"`
  );
  const q = rows[0];
  const details = { onlinePayments: gateway ? gateway.name : 'off (bank transfer only)', ...q };
  if (gateway && gateway.name === 'mock' && process.env.NODE_ENV === 'production') return error('The mock payment gateway is selected in production', details);
  const problems = [];
  if (q.needReview) problems.push(`${q.needReview} online payment(s) need review`);
  if (q.failedWebhooks) problems.push(`${q.failedWebhooks} payment message(s) from the gateway could not be processed`);
  if (q.stuckAttempts) problems.push(`${q.stuckAttempts} online payment(s) have been open for over a day`);
  if (q.claimsOverdue) problems.push(`${q.claimsOverdue} bank transfer(s) have waited over 3 days for confirmation`);
  if (problems.length) return warning(problems.join('; '), details);
  return ok(gateway ? `Online payments are on (${gateway.name}); nothing is stuck` : `Online payments are off. ${q.claimsWaiting} bank transfer(s) waiting for confirmation`, details);
}

async function checkStorage() {
  const dir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
  await fs.promises.access(dir, fs.constants.R_OK | fs.constants.W_OK).catch(() => { throw new Error(`The upload folder is missing or not writable: ${dir}`); });
  const stat = await fs.promises.statfs(dir);
  const freeBytes = Number(stat.bavail) * Number(stat.bsize);
  const totalBytes = Number(stat.blocks) * Number(stat.bsize);
  const freeGb = Math.round((freeBytes / 1e9) * 10) / 10;
  const details = { folder: path.basename(dir), freeGb, freePercent: totalBytes ? Math.round((freeBytes / totalBytes) * 100) : null };
  if (freeBytes < 5e8) return error(`Only ${freeGb} GB of disk space is left for uploads`, details);
  if (freeBytes < 5e9 || (totalBytes && freeBytes / totalBytes < 0.1)) return warning(`Disk space for uploads is getting low (${freeGb} GB free)`, details);
  return ok(`The upload folder is writable (${freeGb} GB free)`, details);
}

async function checkConfiguration() {
  const problems = [];
  if (!process.env.PORTAL_URL) problems.push('PORTAL_URL is not set, so links in emails will not point to the portal');
  if (process.env.NODE_ENV !== 'production') problems.push(`NODE_ENV is "${process.env.NODE_ENV || 'not set'}", not "production"`);
  const details = { nodeEnv: process.env.NODE_ENV || null, portalUrlSet: Boolean(process.env.PORTAL_URL), uptimeMinutes: Math.round(process.uptime() / 60) };
  return problems.length ? warning(problems.join('; '), details) : ok('Configuration looks right', details);
}

const CHECKS = [
  ['database', checkDatabase], ['email', checkEmail], ['backgroundJobs', checkJobs], ['payments', checkPayments], ['storage', checkStorage], ['configuration', checkConfiguration],
];

async function report() {
  const checks = {};
  await Promise.all(CHECKS.map(async ([name, run]) => {
    const started = Date.now();
    try { checks[name] = await run(); } catch (err) { checks[name] = error(`The check itself failed: ${err.message}`); }
    checks[name].ms = Date.now() - started;
  }));
  const ordered = Object.fromEntries(CHECKS.map(([name]) => [name, checks[name]]));
  const statuses = Object.values(ordered).map((c) => c.status);
  const status = statuses.includes('error') ? 'problem' : statuses.includes('warning') ? 'attention' : 'ok';
  return { status, generatedAt: new Date().toISOString(), checks: ordered };
}

module.exports = { liveness, report };
