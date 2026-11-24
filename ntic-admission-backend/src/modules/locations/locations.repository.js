// src/modules/locations/locations.repository.js
// SQL only. No business rules and no HTTP code in this file.

const { query } = require('../../db/pool');

// Active states, alphabetical (for the "select your state" dropdown)
async function listActiveStates() {
  const { rows } = await query(
    `SELECT id, name, code
       FROM states
      WHERE is_active = true
      ORDER BY name`
  );
  return rows;
}

// One state by id, or null if it does not exist
async function findStateById(stateId) {
  const { rows } = await query(
    `SELECT id, name, code, is_active AS "isActive"
       FROM states
      WHERE id = $1`,
    [stateId]
  );
  return rows[0] || null;
}

// Active campuses inside one state
async function listActiveCampusesByState(stateId) {
  const { rows } = await query(
    `SELECT id, state_id AS "stateId", name, code, address, phone, email
       FROM campuses
      WHERE state_id = $1
        AND is_active = true
      ORDER BY name`,
    [stateId]
  );
  return rows;
}

// Active admission categories in the order NTIC wants them shown
async function listActiveCategories() {
  const { rows } = await query(
    `SELECT id, name, code, description
       FROM admission_categories
      WHERE is_active = true
      ORDER BY sort_order, name`
  );
  return rows;
}

// Of the given campus ids, which ones exist and are active? Returns just those ids.
async function findActiveCampusIds(campusIds) {
  const { rows } = await query(
    `SELECT id FROM campuses WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [campusIds]
  );
  return rows.map((row) => row.id);
}

// Of the given category ids, which ones exist and are active? Returns just those ids.
async function findActiveCategoryIds(categoryIds) {
  const { rows } = await query(
    `SELECT id FROM admission_categories WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [categoryIds]
  );
  return rows.map((row) => row.id);
}


// One campus (with the state it belongs to), or null
async function findCampusById(campusId) {
  const { rows } = await query(
    `SELECT id, state_id AS "stateId", name, is_active AS "isActive" FROM campuses WHERE id = $1`,
    [campusId]
  );
  return rows[0] || null;
}

// One category, or null
async function findCategoryById(categoryId) {
  const { rows } = await query(
    `SELECT id, name, code, is_active AS "isActive" FROM admission_categories WHERE id = $1`,
    [categoryId]
  );
  return rows[0] || null;
}

module.exports = {
  listActiveStates,
  findStateById,
  listActiveCampusesByState,
  listActiveCategories,
  findActiveCampusIds,
  findActiveCategoryIds,
  findCampusById,
  findCategoryById,
};