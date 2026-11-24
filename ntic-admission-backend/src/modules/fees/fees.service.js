// src/modules/fees/fees.service.js
// Business rules for fees: the rules themselves, and working out what an applicant pays.

const repo = require('./fees.repository');
const auditService = require('../audit/audit.service');
const locationsService = require('../locations/locations.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { formatMajor } = require('../../utils/money');
const AppError = require('../../utils/AppError');
const {
  createFeeRuleSchema,
  updateFeeRuleSchema,
  quoteQuerySchema,
  listFeeRulesQuerySchema,
} = require('./fees.validation');

// ---------- helpers ----------

// Adds a human-readable amount ("15000.00") next to the exact whole-number one (1500000)
const present = (rule) => ({ ...rule, amount: formatMajor(rule.amountMinor) });

const auditEvent = (context, action, ruleId, metadata) => ({
  actor: context.actor,
  action,
  resourceType: 'fee_rule',
  resourceId: ruleId,
  ip: context.ip,
  userAgent: context.userAgent,
  metadata,
});

// 23P01 = the database refused because the rule would overlap another active rule
function translateDatabaseError(err) {
  if (err.code === '23P01' && err.constraint === 'fee_rules_no_overlap') {
    return AppError.conflict(
      'Another active fee rule already covers this category and scope for some of these dates. ' +
        'End or deactivate the existing rule first.'
    );
  }
  return err;
}

// ---------- fee rules (administrators) ----------

async function createFeeRule(input, context = {}) {
  const data = validate(createFeeRuleSchema, input);

  // The things the rule points at must exist and be active (422 with the field name)
  const problems = [];
  if (!(await locationsService.findActiveCategory(data.categoryId))) {
    problems.push({ field: 'categoryId', message: 'Unknown or inactive category' });
  }
  if (data.campusId && !(await locationsService.findActiveCampus(data.campusId))) {
    problems.push({ field: 'campusId', message: 'Unknown or inactive campus' });
  }
  if (data.stateId && !(await locationsService.findActiveState(data.stateId))) {
    problems.push({ field: 'stateId', message: 'Unknown or inactive state' });
  }
  if (problems.length > 0) {
    throw AppError.validation(problems);
  }

  try {
    return present(
      await withTransaction(async (client) => {
        const ruleId = await repo.insertRule(
          {
            categoryId: data.categoryId,
            stateId: data.stateId,
            campusId: data.campusId,
            amountMinor: data.amount,
            effectiveFrom: data.effectiveFrom,
            effectiveTo: data.effectiveTo,
            notes: data.notes,
          },
          client
        );

        await auditService.record(
          auditEvent(context, 'fee_rule.create', ruleId, {
            categoryId: data.categoryId,
            campusId: data.campusId ?? null,
            stateId: data.stateId ?? null,
            amountMinor: data.amount,
            effectiveFrom: data.effectiveFrom,
            effectiveTo: data.effectiveTo ?? null,
          }),
          { client }
        );

        return repo.findById(ruleId, client);
      })
    );
  } catch (err) {
    throw translateDatabaseError(err);
  }
}

async function listFeeRules(rawQuery) {
  const filters = validate(listFeeRulesQuerySchema, rawQuery);
  return (await repo.list(filters)).map(present);
}

async function getFeeRule(ruleId) {
  assertUuid(ruleId, 'Fee rule id');
  const rule = await repo.findById(ruleId);
  if (!rule) {
    throw AppError.notFound('Fee rule not found');
  }
  return present(rule);
}

// Changes only the end date and/or the on/off switch, with a reason. The price is never edited.
async function updateFeeRule(ruleId, input, context = {}) {
  assertUuid(ruleId, 'Fee rule id');
  const data = validate(updateFeeRuleSchema, input);

  if (data.effectiveTo === undefined && data.active === undefined) {
    throw AppError.validation([
      { field: 'body', message: 'Send effectiveTo and/or active (the price of a rule cannot be edited)' },
    ]);
  }

  try {
    return present(
      await withTransaction(async (client) => {
        const locked = await repo.lockById(ruleId, client);
        if (!locked) {
          throw AppError.notFound('Fee rule not found');
        }
        const before = await repo.findById(ruleId, client);

        if (data.effectiveTo && data.effectiveTo < before.effectiveFrom) {
          throw AppError.validation([
            { field: 'effectiveTo', message: 'effectiveTo cannot be before effectiveFrom' },
          ]);
        }

        // Only the real differences
        const changes = {};
        if (data.effectiveTo !== undefined && data.effectiveTo !== before.effectiveTo) {
          changes.effectiveTo = { from: before.effectiveTo, to: data.effectiveTo };
        }
        if (data.active !== undefined && data.active !== before.active) {
          changes.active = { from: before.active, to: data.active };
        }
        if (Object.keys(changes).length === 0) {
          return before;
        }

        await repo.updateRule(
          ruleId,
          {
            effectiveTo: changes.effectiveTo ? data.effectiveTo : undefined,
            active: changes.active ? data.active : undefined,
          },
          client
        );

        await auditService.record(
          auditEvent(context, 'fee_rule.update', ruleId, { changes, reason: data.reason }),
          { client }
        );

        return repo.findById(ruleId, client);
      })
    );
  } catch (err) {
    throw translateDatabaseError(err);
  }
}

// Active campus + category pairs that currently have no fee (a configuration warning, BR-012)
async function listFeeGaps() {
  return repo.findGaps();
}

// ---------- working out what someone pays ----------

// Used internally (the payment module will call this too). Returns the full rule that applies, or throws.
// NEVER guess: if nothing applies we stop (BR-012).
async function calculateFee(campusId, categoryId) {
  const campus = await locationsService.findActiveCampus(campusId);
  if (!campus) {
    throw AppError.notFound('Campus not found');
  }
  const category = await locationsService.findActiveCategory(categoryId);
  if (!category) {
    throw AppError.notFound('Admission category not found');
  }

  const rule = await repo.findApplicable({
    campusId,
    stateId: campus.stateId,
    categoryId,
  });

  if (!rule) {
    console.warn(`Fee configuration gap: no fee applies for campus ${campusId}, category ${categoryId}`);
    throw new AppError(
      'No fee has been set for this campus and category yet. Please contact NTIC.',
      404,
      'FEE_NOT_CONFIGURED'
    );
  }
  return present(rule);
}

// Public: what an applicant sees before paying. It deliberately leaves out internal details like the rule id.
async function getQuote(rawQuery) {
  const { campusId, categoryId } = validate(quoteQuerySchema, rawQuery);
  const rule = await calculateFee(campusId, categoryId);

  return {
    campusId,
    categoryId,
    amountMinor: rule.amountMinor,
    amount: rule.amount,
    currency: rule.currency,
    calculatedAt: new Date().toISOString(),
  };
}

module.exports = {
  createFeeRule,
  listFeeRules,
  getFeeRule,
  updateFeeRule,
  listFeeGaps,
  calculateFee,
  getQuote,
};