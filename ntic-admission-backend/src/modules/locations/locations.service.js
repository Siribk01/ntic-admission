// src/modules/locations/locations.service.js
// Business rules. Decides what is allowed and what an answer means.
// No SQL here (that is the repository) and no req/res here (that is the controller).

const repo = require('./locations.repository');
const AppError = require('../../utils/AppError');
const { assertUuid } = require('../../utils/ids');


// Reject malformed ids BEFORE they reach PostgreSQL.
// Otherwise the database would throw "invalid input syntax for type uuid" -> a 500 error.

async function getStates() {
  return repo.listActiveStates();
}

async function getCampusesForState(stateId) {
  assertUuid(stateId, 'State id');

  const state = await repo.findStateById(stateId);

  // Rule: an unknown state and a deactivated state look the same to the public.
  // We do not reveal campuses of a state NTIC has switched off.
  if (!state || !state.isActive) {
    throw AppError.notFound('State not found');
  }

  return repo.listActiveCampusesByState(stateId);
}

async function getCategories() {
  return repo.listActiveCategories();
}

// Throws a 422 if any campus id does not exist or has been deactivated
async function assertCampusesActive(campusIds) {
  const found = await repo.findActiveCampusIds(campusIds);
  const missing = campusIds.filter((id) => !found.includes(id));
  if (missing.length > 0) {
    throw AppError.validation([
      { field: 'campusIds', message: `Unknown or inactive campus: ${missing.join(', ')}` },
    ]);
  }
}

// Throws a 422 if any category id does not exist or has been deactivated
async function assertCategoriesActive(categoryIds, field = 'categoryIds') {
  const found = await repo.findActiveCategoryIds(categoryIds);
  const missing = categoryIds.filter((id) => !found.includes(id));
  if (missing.length > 0) {
    throw AppError.validation([
      { field, message: `Unknown or inactive category: ${missing.join(', ')}` },
    ]);
  }
}

// Of the given category ids, which ones exist and are active? Returns just those ids.
async function findActiveCategoryIds(categoryIds) {
  const { rows } = await query(
    `SELECT id FROM admission_categories WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [categoryIds]
  );
  return rows.map((row) => row.id);
}
// These three return the record when it exists AND is active, otherwise null.
// (Callers decide whether "missing" means a 404 or a 422 for their situation.)
async function findActiveCampus(campusId) {
  const campus = await repo.findCampusById(campusId);
  return campus && campus.isActive ? campus : null;
}

async function findActiveState(stateId) {
  const state = await repo.findStateById(stateId);
  return state && state.isActive ? state : null;
}

async function findActiveCategory(categoryId) {
  const category = await repo.findCategoryById(categoryId);
  return category && category.isActive ? category : null;
}

module.exports = {
  getStates,
  getCampusesForState,
  getCategories,
  assertCampusesActive,
  assertCategoriesActive,
  findActiveCampus,
  findActiveState,
  findActiveCategory,
};