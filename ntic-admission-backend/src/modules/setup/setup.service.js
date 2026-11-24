// src/modules/setup/setup.service.js
// Rules for setting up sessions, classes, campuses, fees and staff. Central admins only (enforced in the routes).
const repo = require('./setup.repository');
const v = require('./setup.validation');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { checkPasswordPolicy, hashPassword } = require('../../utils/password');
const { ROLES } = require('../../constants/roles');
const AppError = require('../../utils/AppError');

const audit = (client, context, action, resourceType, resourceId, metadata) =>
  auditService.record({ actor: context.actor, action, resourceType, resourceId, ip: context.ip, userAgent: context.userAgent, metadata }, { client });

// A duplicate code or email is the database refusing; turn that into a clear message
async function guarded(work, duplicateMessage) {
  try { return await work(); } catch (err) {
    if (err && err.code === '23505') throw AppError.conflict(duplicateMessage);
    if (err && err.code === '23503') throw AppError.conflict('This is still used by other records, so it cannot be changed that way. Mark it inactive instead.');
    if (err && err.code === '23514') throw AppError.validation([{ field: 'body', message: 'The database does not accept one of these values. Check the status or role.' }]);
    throw err;
  }
}
const naira = (s) => { const [a, b = ''] = s.split('.'); return Number(a) * 100 + Number((b + '00').slice(0, 2)); }; // "10000.50" -> 1000050 kobo
const found = (row, what) => { if (!row) throw AppError.notFound(`${what} not found`); return row; };

// =============== admission sessions ===============
const listCycles = () => repo.listCycles();

async function createCycle(input, context) {
  const d = validate(v.createCycleSchema, input);
  return guarded(() => withTransaction(async (client) => {
    const id = await repo.insertCycle(d, client);
    await audit(client, context, 'setup.cycle_create', 'admission_cycle', id, { name: d.name, status: d.status });
    return repo.findCycle(id, client);
  }), 'A session with these details already exists');
}

async function updateCycle(id, input, context) {
  assertUuid(id, 'Session id');
  const d = validate(v.updateCycleSchema, input);
  return withTransaction(async (client) => {
    const cur = found(await repo.findCycle(id, client), 'Session');
    const next = { name: cur.name, academicSession: cur.academicSession, status: cur.status, opensAt: cur.opensAt.toISOString(), closesAt: cur.closesAt.toISOString(), ...d };
    if (Date.parse(next.closesAt) <= Date.parse(next.opensAt)) throw AppError.validation([{ field: 'closesAt', message: 'The closing date must be after the opening date' }]);
    await repo.updateCycle(id, next, client);
    await audit(client, context, 'setup.cycle_update', 'admission_cycle', id, { changed: Object.keys(d), status: next.status });
    return repo.findCycle(id, client);
  });
}

// Replaces the list of classes offered in this session
async function setCycleCategories(id, input, context) {
  assertUuid(id, 'Session id');
  const { categoryIds } = validate(v.cycleCategoriesSchema, input);
  const unique = [...new Set(categoryIds)];
  return guarded(() => withTransaction(async (client) => {
    found(await repo.findCycle(id, client), 'Session');
    if (unique.length && (await repo.countActiveCategories(unique, client)) !== unique.length) {
      throw AppError.validation([{ field: 'categoryIds', message: 'One of the classes does not exist' }]);
    }
    await repo.setCycleCategories(id, unique, client);
    await audit(client, context, 'setup.cycle_categories', 'admission_cycle', id, { count: unique.length });
    return repo.findCycle(id, client);
  }), 'These classes cannot be changed');
}

// =============== classes ===============
const listCategories = () => repo.listCategories();

async function createCategory(input, context) {
  const d = validate(v.createCategorySchema, input);
  return guarded(() => withTransaction(async (client) => {
    const id = await repo.insertCategory(d, client);
    await audit(client, context, 'setup.category_create', 'admission_category', id, { code: d.code });
    return repo.findCategory(id, client);
  }), `A class with the code ${d.code} already exists`);
}

async function updateCategory(id, input, context) {
  assertUuid(id, 'Class id');
  const d = validate(v.updateCategorySchema, input);
  return withTransaction(async (client) => {
    const cur = found(await repo.findCategory(id, client), 'Class');
    await repo.updateCategory(id, { ...cur, ...d }, client);
    await audit(client, context, 'setup.category_update', 'admission_category', id, { changed: Object.keys(d) });
    return repo.findCategory(id, client);
  });
}

// =============== campuses ===============
const listCampuses = () => repo.listCampuses();

async function createCampus(input, context) {
  const d = validate(v.createCampusSchema, input);
  return guarded(() => withTransaction(async (client) => {
    if (!(await repo.stateExists(d.stateId, client))) throw AppError.validation([{ field: 'stateId', message: 'That state does not exist' }]);
    const id = await repo.insertCampus(d, client);
    await audit(client, context, 'setup.campus_create', 'campus', id, { code: d.code });
    return repo.findCampus(id, client);
  }), `A campus with the code ${d.code} already exists`);
}

async function updateCampus(id, input, context) {
  assertUuid(id, 'Campus id');
  const d = validate(v.updateCampusSchema, input);
  return withTransaction(async (client) => {
    const cur = found(await repo.findCampus(id, client), 'Campus');
    const next = { ...cur, ...d };
    if (d.stateId && !(await repo.stateExists(d.stateId, client))) throw AppError.validation([{ field: 'stateId', message: 'That state does not exist' }]);
    await repo.updateCampus(id, next, client);
    await audit(client, context, 'setup.campus_update', 'campus', id, { changed: Object.keys(d) });
    return repo.findCampus(id, client);
  });
}

// =============== fees ===============
const listFees = () => repo.listFees();

async function createFee(input, context) {
  const d = validate(v.createFeeSchema, input);
  return withTransaction(async (client) => {
    found(await repo.findCategory(d.categoryId, client), 'Class');
    if (d.campusId) found(await repo.findCampus(d.campusId, client), 'Campus');
    if (d.stateId && !(await repo.stateExists(d.stateId, client))) throw AppError.validation([{ field: 'stateId', message: 'That state does not exist' }]);
    if (await repo.overlappingFee({ categoryId: d.categoryId, campusId: d.campusId, stateId: d.stateId, from: d.effectiveFrom, to: d.effectiveTo }, client)) {
      throw AppError.conflict('An active fee already covers this class and place for these dates. End or switch off the old fee first.');
    }
    const amountMinor = naira(d.amount);
    if (amountMinor <= 0) throw AppError.validation([{ field: 'amount', message: 'The fee must be more than zero' }]);
    const id = await repo.insertFee({ ...d, amountMinor }, client);
    await audit(client, context, 'setup.fee_create', 'fee_rule', id, { categoryId: d.categoryId, amountMinor });
    return repo.findFee(id, client);
  });
}

async function updateFee(id, input, context) {
  assertUuid(id, 'Fee id');
  const d = validate(v.updateFeeSchema, input);
  return withTransaction(async (client) => {
    const cur = found(await repo.findFee(id, client), 'Fee');
    const next = {
      amountMinor: d.amount !== undefined ? naira(d.amount) : cur.amountMinor,
      effectiveTo: d.effectiveTo !== undefined ? d.effectiveTo : cur.effectiveTo,
      active: d.active !== undefined ? d.active : cur.active,
      notes: d.notes !== undefined ? d.notes : cur.notes,
    };
    if (next.amountMinor <= 0) throw AppError.validation([{ field: 'amount', message: 'The fee must be more than zero' }]);
    if (next.effectiveTo && next.effectiveTo < cur.effectiveFrom) throw AppError.validation([{ field: 'effectiveTo', message: 'The end date cannot be before the start date' }]);
    if (next.active && (await repo.overlappingFee({ categoryId: cur.categoryId, campusId: cur.campusId, stateId: cur.stateId, from: cur.effectiveFrom, to: next.effectiveTo, exceptId: id }, client))) {
      throw AppError.conflict('Another active fee already covers this class and place for these dates.');
    }
    await repo.updateFee(id, next, client);
    await audit(client, context, 'setup.fee_update', 'fee_rule', id, { changed: Object.keys(d), from: cur.amountMinor, to: next.amountMinor });
    return repo.findFee(id, client);
  });
}

// =============== staff ===============
const listStaff = () => repo.listStaff();

function checkScope(role, campusIds) {
  if (role === ROLES.CENTRAL_ADMIN && campusIds.length) throw AppError.validation([{ field: 'campusIds', message: 'A central admin works across all campuses, so do not choose any' }]);
  if (role !== ROLES.CENTRAL_ADMIN && role !== ROLES.INTERVIEWER && campusIds.length === 0) {
    throw AppError.validation([{ field: 'campusIds', message: 'Choose at least one campus for this role' }]);
  }
}
async function checkCampusesExist(ids, client) {
  if (ids.length && (await repo.countCampuses(ids, client)) !== ids.length) throw AppError.validation([{ field: 'campusIds', message: 'One of the campuses does not exist' }]);
}
function checkPassword(password) {
  const problems = checkPasswordPolicy(password);
  if (problems.length) throw AppError.validation(problems.map((message) => ({ field: 'password', message })));
}

async function createStaff(input, context) {
  const d = validate(v.createStaffSchema, input);
  const campusIds = [...new Set(d.campusIds || [])];
  checkScope(d.role, campusIds);
  checkPassword(d.password);
  const passwordHash = await hashPassword(d.password); // slow on purpose, so done before the transaction
  return guarded(() => withTransaction(async (client) => {
    await checkCampusesExist(campusIds, client);
    const id = await repo.insertStaff({ ...d, passwordHash }, client);
    await repo.setStaffCampuses(id, campusIds, client);
    await audit(client, context, 'setup.staff_create', 'user', id, { role: d.role, campuses: campusIds.length });
    return repo.findStaff(id, client);
  }), 'An account with this email address already exists');
}

async function updateStaff(id, input, context) {
  assertUuid(id, 'Staff id');
  const d = validate(v.updateStaffSchema, input);
  return withTransaction(async (client) => {
    const cur = found(await repo.findStaff(id, client), 'Staff member');
    if (id === context.actor.id && ((d.role && d.role !== cur.role) || d.isActive === false)) {
      throw AppError.forbidden('You cannot change your own role or switch off your own account');
    }
    const role = d.role || cur.role;
    const campusIds = d.campusIds ? [...new Set(d.campusIds)] : role === ROLES.CENTRAL_ADMIN ? [] : cur.campuses.map((c) => c.id);
    checkScope(role, campusIds);
    await checkCampusesExist(campusIds, client);
    await repo.updateStaff(id, {
      firstName: d.firstName ?? cur.firstName, lastName: d.lastName ?? cur.lastName,
      phone: d.phone !== undefined ? d.phone : cur.phone, role, isActive: d.isActive ?? cur.isActive,
    }, client);
    await repo.setStaffCampuses(id, campusIds, client);
    await audit(client, context, 'setup.staff_update', 'user', id, { changed: Object.keys(d), role });
    return repo.findStaff(id, client);
  });
}

async function resetStaffPassword(id, input, context) {
  assertUuid(id, 'Staff id');
  const { password } = validate(v.resetPasswordSchema, input);
  checkPassword(password);
  const hash = await hashPassword(password);
  await withTransaction(async (client) => {
    found(await repo.findStaff(id, client), 'Staff member');
    await repo.setPassword(id, hash, client);
    await audit(client, context, 'setup.staff_password_reset', 'user', id, {});
  });
  return { ok: true };
}

module.exports = {
  listCycles, createCycle, updateCycle, setCycleCategories, listCategories, createCategory, updateCategory,
  listCampuses, createCampus, updateCampus, listFees, createFee, updateFee,
  listStaff, createStaff, updateStaff, resetStaffPassword,
};
