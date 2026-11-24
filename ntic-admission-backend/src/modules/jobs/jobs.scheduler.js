// src/modules/jobs/jobs.scheduler.js
// The timer. Every few minutes it runs the background jobs, inside the API process (like the email worker).
// If several servers run at once, the database lock in runExclusive makes sure only one does the work each round.

const service = require('./jobs.service');

const INTERVAL_MS = 5 * 60 * 1000;   // every 5 minutes
const FIRST_RUN_DELAY_MS = 30 * 1000; // shortly after start-up, so a restart does not delay expiry by a whole interval
let timer = null;
let first = null;
let running = false;

async function tick() {
  if (running) return; // never let two rounds overlap inside this process
  running = true;
  try {
    const results = await service.runExclusive(() => service.runJobs({ respectReminderHours: true }));
    if (results) {
      const done = results.filter((r) => r.processed > 0 || r.failed > 0);
      if (done.length) console.log('Background jobs:', done.map((r) => `${r.job}=${r.processed}${r.failed ? ` (${r.failed} failed)` : ''}`).join(', '));
    }
  } catch (err) {
    console.error('Background jobs error:', err.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer || process.env.JOBS_ENABLED === 'false') return;
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref(); // does not keep the process alive on its own
  first = setTimeout(tick, FIRST_RUN_DELAY_MS);
  first.unref();
  console.log('Background jobs scheduled (every 5 minutes)');
}

async function stop() {
  if (timer) clearInterval(timer);
  if (first) clearTimeout(first);
  timer = null;
  first = null;
  while (running) await new Promise((resolve) => setTimeout(resolve, 100)); // let a round already running finish
}

const isScheduled = () => timer !== null;

module.exports = { start, stop, tick, isScheduled };
