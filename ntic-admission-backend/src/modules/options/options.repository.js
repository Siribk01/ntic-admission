// src/modules/options/options.repository.js
// Read-only lists the application form needs. Nothing here changes data.
const { query } = require('../../db/pool');

async function states() {
  const { rows } = await query(`SELECT id, name FROM states WHERE is_active = true ORDER BY name`);
  return rows;
}
async function campuses() {
  const { rows } = await query(`SELECT id, code, name FROM campuses WHERE is_active = true ORDER BY name`);
  return rows;
}
// Only cycles that are accepting applications right now (the same rule the backend enforces when an application is started)
async function openCycles() {
  const { rows } = await query(
    `SELECT id, academic_session AS "academicSession", opens_at AS "opensAt", closes_at AS "closesAt"
       FROM admission_cycles WHERE status = 'active' AND now() >= opens_at AND now() < closes_at ORDER BY opens_at DESC`
  );
  return rows;
}
async function cycleCategories(cycleIds) {
  const { rows } = await query(
    `SELECT cc.cycle_id AS "cycleId", c.id, c.name
       FROM cycle_categories cc JOIN admission_categories c ON c.id = cc.category_id
      WHERE cc.cycle_id = ANY($1::uuid[]) AND c.is_active = true ORDER BY c.name`,
    [cycleIds]
  );
  return rows;
}
// A rule with no campus is the price for every campus; a rule with a campus overrides it for that campus
async function feeRules() {
  const { rows } = await query(`SELECT category_id AS "categoryId", campus_id AS "campusId", amount_minor::float8 AS "amountMinor" FROM fee_rules`);
  return rows;
}

module.exports = { states, campuses, openCycles, cycleCategories, feeRules };
