// src/modules/notifications/mail.js
// Sends one email. Three modes, chosen from the environment:
//   smtp     SMTP_HOST is set: real delivery through any SMTP provider
//   console  no SMTP_HOST and NOT production: the email is printed in the terminal (handy while developing)
//   disabled no SMTP_HOST in production: nothing is sent, emails wait in the outbox. This is deliberate:
//            we never pretend to have delivered an email in production.

const nodemailer = require('nodemailer');
require('../../config/env'); // makes sure .env has been loaded

let cached = null;

function getMailer() {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  const from = process.env.MAIL_FROM || 'NTIC Admissions <no-reply@localhost>';

  if (host) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
    const transport = nodemailer.createTransport({
      host, port, secure,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    });
    cached = { mode: 'smtp', send: (msg) => transport.sendMail({ from, ...msg }) };
  } else if (process.env.NODE_ENV !== 'production') {
    cached = {
      mode: 'console',
      send: async (msg) => {
        console.log(`\n--- EMAIL (console mode, nothing was sent) ---\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n--- end ---\n`);
      },
    };
  } else {
    cached = { mode: 'disabled', send: async () => { throw new Error('SMTP is not configured'); } };
  }
  return cached;
}

module.exports = { getMailer };
