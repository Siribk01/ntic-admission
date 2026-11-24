// src/modules/cycles/cycles.service.js
// Business rules for admission cycles.

const repo = require('./cycles.repository');
const auditService = require('../audit/audit.service');
const locationsService = require('../locations/locations.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const AppError = require('../../utils/AppError');
const {
  createCycleSchema,
  updateCycleSchema,
  activateCycleSchema,
  closeCycleSchema,
  reopenCycleSchema,
} = require('./cycles.validation');

// ---------- helpers ----------

const toMs = (value) => new Date(value).getTime();
const toIso = (value) => new Date(value).toISOString();

// 409: the request is fine, but the cycle is not in a state where it can be done
const wrongState = (message) => new AppError(message, 409, 'INVALID_STATE');

// Opens a transaction, locks the cycle's row, and hands the locked state to `work`.
// Everything inside (checks, changes, audit entry) is saved together or not at all.
async function withLockedCycle(cycleId, work) {
  assertUuid(cycleId, 'Cycle id');
  return withTransaction(async (client) => {
    const current = await repo.lockById(cycleId, client);
    if (!current) {
      throw AppError.notFound('Admission cycle not found');
    }
    return work(client, current);
  });
}

// Compares what was asked for with what is stored, and returns ONLY the real differences
function describeChanges(before, data) {
  const changes = {};

  for (const key of ['name', 'academicSession']) {
    if (data[key] !== undefined && data[key] !== before[key]) {
      changes[key] = { from: before[key], to: data[key] };
    }
  }
  for (const key of ['opensAt', 'closesAt']) {
    if (data[key] !== undefined && toMs(data[key]) !== toMs(before[key])) {
      changes[key] = { from: toIso(before[key]), to: toIso(data[key]) };
    }
  }
  if (data.categories !== undefined) {
    const normalize = (list) =>
      list
        .map((c) => ({ categoryId: c.categoryId, interviewRequired: c.interviewRequired === true }))
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId));
    const from = normalize(before.categories);
    const to = normalize(data.categories);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.categories = { from, to };
    }
  }
  return changes;
}

const auditEvent = (context, action, cycleId, metadata) => ({
  actor: context.actor,
  action,
  resourceType: 'admission_cycle',
  resourceId: cycleId,
  ip: context.ip,
  userAgent: context.userAgent,
  metadata,
});

// A name that already exists is the one database rule an administrator can realistically hit
function translateDatabaseError(err) {
  if (err.code === '23505' && err.constraint === 'admission_cycles_name_uq') {
    return AppError.conflict('A cycle with this name already exists');
  }
  return err;
}

// ---------- create and read ----------

// context = { actor, ip, userAgent }
async function createCycle(input, context = {}) {
  const data = validate(createCycleSchema, input);

  await locationsService.assertCategoriesActive(
    data.categories.map((c) => c.categoryId),
    'categories'
  );

  try {
    return await withTransaction(async (client) => {
      const cycleId = await repo.insertCycle(
        {
          name: data.name,
          academicSession: data.academicSession,
          opensAt: data.opensAt,
          closesAt: data.closesAt,
        },
        client
      );
      await repo.insertCycleCategories(cycleId, data.categories, client);

      await auditService.record(
        auditEvent(context, 'cycle.create', cycleId, {
          name: data.name,
          academicSession: data.academicSession,
          opensAt: data.opensAt,
          closesAt: data.closesAt,
          categoryIds: data.categories.map((c) => c.categoryId),
        }),
        { client }
      );

      return repo.findById(cycleId, client);
    });
  } catch (err) {
    throw translateDatabaseError(err);
  }
}

async function listAllCycles() {
  return repo.listAll();
}

async function getCycle(cycleId) {
  assertUuid(cycleId, 'Cycle id');
  const cycle = await repo.findById(cycleId);
  if (!cycle) {
    throw AppError.notFound('Admission cycle not found');
  }
  return cycle;
}

// Public: only active cycles, with the same computed "is it open right now" flag
async function listPublicCycles() {
  return repo.listActive();
}

// ---------- update ----------

async function updateCycle(cycleId, input, context = {}) {
  const data = validate(updateCycleSchema, input);

  // Checked here (not in the schema) so it only appears when the request is otherwise valid
  if (Object.keys(data).length === 0) {
    throw AppError.validation([{ field: 'body', message: 'Provide at least one field to change' }]);
  }

  if (data.categories) {
    await locationsService.assertCategoriesActive(
      data.categories.map((c) => c.categoryId),
      'categories'
    );
  }

  try {
    return await withLockedCycle(cycleId, async (client, current) => {
      // Rule: a closed cycle is frozen. Reopen it (with a reason) before editing.
      if (current.status === 'closed') {
        throw wrongState('A closed cycle cannot be edited. Reopen it first.');
      }

      // Rule: the dates must still make sense once the change is applied
      const opensMs = data.opensAt ? toMs(data.opensAt) : toMs(current.opensAt);
      const closesMs = data.closesAt ? toMs(data.closesAt) : toMs(current.closesAt);
      if (closesMs <= opensMs) {
        throw AppError.validation([
          { field: 'closesAt', message: 'Closing time must be after the opening time' },
        ]);
      }

      // Rule: an ACTIVE cycle cannot be ended by setting a closing time in the past. Close it properly instead.
      if (current.status === 'active' && data.closesAt && closesMs <= Date.now()) {
        throw AppError.validation([
          { field: 'closesAt', message: 'To end an active cycle early, close it instead of moving its closing time into the past' },
        ]);
      }

      // TODO (applications module): once applications exist, refuse to REMOVE a category that already has applications.

      const before = await repo.findById(cycleId, client);
      const changes = describeChanges(before, data);

      // Nothing really changed: do not touch the row, and do not write a misleading audit entry
      if (Object.keys(changes).length === 0) {
        return before;
      }

      const fields = {};
      for (const key of ['name', 'academicSession', 'opensAt', 'closesAt']) {
        if (changes[key]) fields[key] = data[key];
      }
      await repo.updateFields(cycleId, fields, client);
      if (changes.categories) {
        await repo.replaceCycleCategories(cycleId, data.categories, client);
      }

      await auditService.record(auditEvent(context, 'cycle.update', cycleId, { changes }), { client });

      return repo.findById(cycleId, client);
    });
  } catch (err) {
    throw translateDatabaseError(err);
  }
}

// ---------- status changes ----------

// draft -> active
async function activateCycle(cycleId, input, context = {}) {
  validate(activateCycleSchema, input);

  return withLockedCycle(cycleId, async (client, current) => {
    if (current.status !== 'draft') {
      throw wrongState(`Only a draft cycle can be activated (this cycle is ${current.status}).`);
    }
    if (toMs(current.closesAt) <= Date.now()) {
      throw AppError.validation([
        { field: 'closesAt', message: 'The closing time has already passed. Edit the dates before activating.' },
      ]);
    }

    await repo.setStatus(cycleId, 'active', client);
    await auditService.record(auditEvent(context, 'cycle.activate', cycleId, {}), { client });
    return repo.findById(cycleId, client);
  });
}

// active -> closed (stops all new applications at once, whatever the dates say)
async function closeCycle(cycleId, input, context = {}) {
  const data = validate(closeCycleSchema, input);

  return withLockedCycle(cycleId, async (client, current) => {
    if (current.status !== 'active') {
      throw wrongState(`Only an active cycle can be closed (this cycle is ${current.status}).`);
    }

    await repo.setStatus(cycleId, 'closed', client);
    await auditService.record(
      auditEvent(context, 'cycle.close', cycleId, { reason: data.reason ?? null }),
      { client }
    );
    return repo.findById(cycleId, client);
  });
}

// closed -> active, on purpose, with a reason. Needs a closing time that is still in the future.
async function reopenCycle(cycleId, input, context = {}) {
  const data = validate(reopenCycleSchema, input);

  return withLockedCycle(cycleId, async (client, current) => {
    if (current.status !== 'closed') {
      throw wrongState(`Only a closed cycle can be reopened (this cycle is ${current.status}).`);
    }

    const newClosesMs = data.closesAt ? toMs(data.closesAt) : toMs(current.closesAt);
    if (newClosesMs <= Date.now()) {
      throw AppError.validation([
        { field: 'closesAt', message: 'The closing time has passed. Provide a new closing time in the future.' },
      ]);
    }
    if (newClosesMs <= toMs(current.opensAt)) {
      throw AppError.validation([
        { field: 'closesAt', message: 'Closing time must be after the opening time' },
      ]);
    }

    if (data.closesAt) {
      await repo.updateFields(cycleId, { closesAt: data.closesAt }, client);
    }
    await repo.setStatus(cycleId, 'active', client);

    await auditService.record(
      auditEvent(context, 'cycle.reopen', cycleId, {
        reason: data.reason,
        previousClosesAt: toIso(current.closesAt),
        closesAt: new Date(newClosesMs).toISOString(),
      }),
      { client }
    );
    return repo.findById(cycleId, client);
  });
}

module.exports = {
  createCycle,
  listAllCycles,
  getCycle,
  listPublicCycles,
  updateCycle,
  activateCycle,
  closeCycle,
  reopenCycle,
};