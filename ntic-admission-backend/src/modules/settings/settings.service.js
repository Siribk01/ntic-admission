// src/modules/settings/settings.service.js
// Reading the settings (used by the background jobs) and changing them (central admin only).

const repo = require('./settings.repository');
const { DEFINITIONS, KEYS, keyOfApiName } = require('./settings.definitions');
const { updateSettingsSchema } = require('./settings.validation');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const AppError = require('../../utils/AppError');

// A stored value that is not a valid whole number inside its limits (someone edited the table by hand) is ignored,
// and the default is used, so a bad row can never stop the jobs.
function effectiveValue(key, stored) {
  const d = DEFINITIONS[key];
  const ok = d.type === 'boolean' ? typeof stored === 'boolean' : Number.isInteger(stored) && stored >= d.min && stored <= d.max;
  return ok ? stored : d.default;
}

// { unpaid_expiry_days: 7, ... } for the code that needs the numbers
async function getValues(db) {
  const rows = await repo.findAll(db);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(KEYS.map((key) => [key, effectiveValue(key, stored[key])]));
}

// The same, described for the admin screen
async function listSettings() {
  const rows = await repo.findAll();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r]));
  const out = {};
  for (const key of KEYS) {
    const d = DEFINITIONS[key];
    const value = effectiveValue(key, stored[key] && stored[key].value);
    out[d.api] = {
      value, default: d.default, isDefault: value === d.default,
      ...(d.type === 'boolean' ? { type: 'boolean' } : { type: 'integer', min: d.min, max: d.max }),
      description: d.description,
      updatedAt: stored[key] ? stored[key].updatedAt : null,
    };
  }
  return out;
}

async function updateSettings(input, context) {
  const data = validate(updateSettingsSchema, input);

  await withTransaction(async (client) => {
    // Two administrators saving at once must not be able to create a combination neither of them checked
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ntic_settings'))`);
    const before = await getValues(client);
    const after = { ...before };
    for (const [apiName, value] of Object.entries(data)) after[keyOfApiName(apiName)] = value;

    if (after.unpaid_warning_days >= after.unpaid_expiry_days) {
      throw AppError.validation([{
        field: 'unpaidWarningDays',
        message: 'The payment reminder must come before the deadline: unpaidWarningDays must be less than unpaidExpiryDays',
      }]);
    }

    for (const [apiName, value] of Object.entries(data)) {
      const key = keyOfApiName(apiName);
      if (before[key] === value) continue; // nothing changed, nothing to record
      const settingId = await repo.upsert(key, value, context.actor.id, client);
      await auditService.record({
        actor: context.actor, action: 'settings.update', resourceType: 'setting', resourceId: settingId,
        ip: context.ip, userAgent: context.userAgent, metadata: { key, from: before[key], to: value },
      }, { client });
    }
  });
  return listSettings();
}

module.exports = { getValues, listSettings, updateSettings };
