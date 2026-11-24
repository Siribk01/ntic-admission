// src/modules/settings/settings.definitions.js
// A setting is a whole number inside min..max, or (type: 'boolean') a yes/no switch.
// The settings an administrator may change, with their defaults and limits. One place, so the API, the validation
// and the background jobs can never disagree about a name or a range.
//   key = how it is stored in the database, api = how it appears in requests and responses.

const DEFINITIONS = Object.freeze({
  unpaid_expiry_days: {
    api: 'unpaidExpiryDays', default: 7, min: 1, max: 90,
    description: 'How many days a submitted application stays open while its fee is unpaid. After that it is closed as expired.',
  },
  unpaid_warning_days: {
    api: 'unpaidWarningDays', default: 2, min: 0, max: 30,
    description: 'Days before the payment deadline when the parent gets a reminder. 0 means no reminder.',
  },
  offer_reminder_days: {
    api: 'offerReminderDays', default: 3, min: 0, max: 30,
    description: 'Days before an offer deadline when the parent is reminded to respond. 0 means no reminder.',
  },
  exam_reminder_hours: {
    api: 'examReminderHours', default: 24, min: 0, max: 168,
    description: 'Hours before an exam when the parent gets a reminder. 0 means no reminder.',
  },
  interview_reminder_hours: {
    api: 'interviewReminderHours', default: 24, min: 0, max: 168,
    description: 'Hours before an interview when the parent gets a reminder. 0 means no reminder.',
  },
  online_payments_enabled: {
    api: 'onlinePaymentsEnabled', type: 'boolean', default: true,
    description: 'If off, parents cannot start online payments (they can still pay by bank transfer). Use it to pause online payments without changing the server.',
  },
  require_verified_email: {
    api: 'requireVerifiedEmail', type: 'boolean', default: true,
    description: 'If on, a parent must confirm their email address (by the link we email them) before submitting an application.',
  },
});

const KEYS = Object.keys(DEFINITIONS);
const keyOfApiName = (apiName) => KEYS.find((key) => DEFINITIONS[key].api === apiName);

module.exports = { DEFINITIONS, KEYS, keyOfApiName };
