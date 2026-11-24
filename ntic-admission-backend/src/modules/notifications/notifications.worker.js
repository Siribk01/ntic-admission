// src/modules/notifications/notifications.worker.js
// Every few seconds, sends whatever emails are due. Runs inside the API process.
// (Later, if load grows, this same file can run as its own process without changes to the rest.)

const service = require('./notifications.service');
const { getMailer } = require('./mail');

const INTERVAL_MS = 15000;
let timer = null;
let running = false;

async function tick() {
  if (running) return; // never let two rounds overlap
  running = true;
  try {
    await service.processDue();
  } catch (err) {
    console.error('Notification worker error:', err.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer || process.env.NOTIFICATIONS_ENABLED === 'false') return;
  const { mode } = getMailer();
  if (mode === 'disabled') {
    console.error('SMTP_HOST is not set: emails will wait in the outbox and NOT be sent. Set SMTP_* in .env.');
  } else {
    console.log(`Notification worker started (mail mode: ${mode})`);
  }
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref(); // does not keep the process alive on its own
  tick();
}

async function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  // let a round that is already running finish
  while (running) await new Promise((resolve) => setTimeout(resolve, 100));
}

module.exports = { start, stop, tick };
