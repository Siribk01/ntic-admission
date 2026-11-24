// src/modules/emailTemplates/emailTemplates.service.js
// Admin-editable wording for the automatic emails. The built-in wording is always the fallback.

const repo = require('./emailTemplates.repository');
const { KEYS, PLACEHOLDERS, REQUIRES_DETAILS, applyOverride, SAMPLE_CONTEXT } = require('./emailTemplates.definitions');
const { keySchema, saveSchema, previewSchema } = require('./emailTemplates.validation');
const { render, TEMPLATES } = require('../notifications/notifications.templates');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const AppError = require('../../utils/AppError');

const shown = (o) => o && { subject: o.subject, body: o.body, enabled: o.enabled, version: o.version, updatedAt: o.updatedAt };
const builtIn = (key) => {
  const r = render(key, SAMPLE_CONTEXT);
  return { subject: r.subject, text: r.text };
};

async function list() {
  const overrides = Object.fromEntries((await repo.list()).map((o) => [o.key, o]));
  return KEYS.map((key) => ({
    key,
    defaultSubject: TEMPLATES[key](SAMPLE_CONTEXT).subject,
    custom: !!overrides[key],
    enabled: overrides[key] ? overrides[key].enabled : null,
    version: overrides[key] ? overrides[key].version : 0,
    updatedAt: overrides[key] ? overrides[key].updatedAt : null,
  }));
}

async function get(key) {
  const k = validate(keySchema, key);
  const o = await repo.find(k);
  return { key: k, placeholders: PLACEHOLDERS, requiresDetails: REQUIRES_DETAILS.has(k), builtIn: builtIn(k), override: shown(o) };
}

async function versions(key) {
  const k = validate(keySchema, key);
  const o = await repo.find(k);
  return o ? repo.versions(o.id) : [];
}

async function save(key, input, context) {
  const k = validate(keySchema, key);
  const data = validate(saveSchema(k), input);
  const saved = await withTransaction(async (client) => {
    const current = await repo.lock(k, client);
    let result;
    if (!current) {
      if (data.version !== 0) throw AppError.conflict('There is no custom wording for this email yet. Reload and try again');
      result = await repo.insert(k, data, context.actor.id, client);
      if (!result) throw AppError.conflict('Someone else just saved wording for this email. Reload it and make your change again');
    } else {
      if (current.version !== data.version) {
        throw AppError.conflict(`Someone else saved this wording since you opened it (it is now version ${current.version}). Reload it and make your change again`);
      }
      result = await repo.update(current.id, data, context.actor.id, client);
    }
    await repo.insertVersion(result, context.actor.id, client);
    await auditService.record({
      actor: context.actor, action: 'email_template.update', resourceType: 'email_template', resourceId: result.id,
      ip: context.ip, userAgent: context.userAgent, metadata: { key: k, toVersion: result.version, enabled: result.enabled },
    }, { client });
    return result;
  });
  return shown(saved);
}

// Shows the draft wording filled with sample values, WITHOUT saving it
async function preview(key, input) {
  const k = validate(keySchema, key);
  const draft = validate(previewSchema(k), input);
  const r = render(k, SAMPLE_CONTEXT, draft);
  return { builtIn: builtIn(k), custom: { subject: r.subject, text: r.text, html: r.html } };
}

// Used by the outbox when an email is queued. Never throws: a broken override must not block a payment or a decision.
// It reads outside the caller's transaction on purpose: a failed read here must not abort the business transaction.
async function activeOverride(key) {
  try {
    return await repo.findActive(key);
  } catch {
    return null;
  }
}

module.exports = { list, get, versions, save, preview, activeOverride };
