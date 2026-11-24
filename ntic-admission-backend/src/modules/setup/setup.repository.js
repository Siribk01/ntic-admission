// src/modules/setup/setup.repository.js
// SQL only. Every query uses placeholders ($1, $2 ...), never string-joined values.
const { query } = require('../../db/pool');

// ---------- cycles ----------
const CYCLE = `SELECT c.id, c.name, c.academic_session AS "academicSession", c.status, c.opens_at AS "opensAt", c.closes_at AS "closesAt",
  COALESCE((SELECT json_agg(json_build_object('id', k.id, 'name', k.name) ORDER BY k.sort_order, k.name)
              FROM cycle_categories cc JOIN admission_categories k ON k.id = cc.category_id WHERE cc.cycle_id = c.id), '[]'::json) AS categories
  FROM admission_cycles c`;
const listCycles = async () => (await query(`${CYCLE} ORDER BY c.opens_at DESC`)).rows;
const findCycle = async (id, db = { query }) => (await db.query(`${CYCLE} WHERE c.id = $1`, [id])).rows[0] || null;
async function insertCycle(d, client) {
  const { rows } = await client.query(
    `INSERT INTO admission_cycles (name, academic_session, status, opens_at, closes_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [d.name, d.academicSession, d.status, d.opensAt, d.closesAt]);
  return rows[0].id;
}
const updateCycle = (id, d, client) => client.query(
  `UPDATE admission_cycles SET name=$2, academic_session=$3, status=$4, opens_at=$5, closes_at=$6, updated_at=now() WHERE id=$1`,
  [id, d.name, d.academicSession, d.status, d.opensAt, d.closesAt]);
async function setCycleCategories(cycleId, categoryIds, client) {
  await client.query(`DELETE FROM cycle_categories WHERE cycle_id = $1 AND NOT (category_id = ANY($2::uuid[]))`, [cycleId, categoryIds]);
  await client.query(
    `INSERT INTO cycle_categories (cycle_id, category_id) SELECT $1, k FROM unnest($2::uuid[]) AS k ON CONFLICT DO NOTHING`, [cycleId, categoryIds]);
}
const countActiveCategories = async (ids, db = { query }) =>
  Number((await db.query(`SELECT count(*) FROM admission_categories WHERE id = ANY($1::uuid[])`, [ids])).rows[0].count);

// ---------- categories ----------
const CATEGORY = `SELECT id, name, code, description, sort_order AS "sortOrder", is_active AS "isActive" FROM admission_categories`;
const listCategories = async () => (await query(`${CATEGORY} ORDER BY sort_order, name`)).rows;
const findCategory = async (id, db = { query }) => (await db.query(`${CATEGORY} WHERE id = $1`, [id])).rows[0] || null;
async function insertCategory(d, client) {
  const { rows } = await client.query(
    `INSERT INTO admission_categories (name, code, description, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
    [d.name, d.code, d.description ?? null, d.sortOrder ?? 0]);
  return rows[0].id;
}
const updateCategory = (id, d, client) => client.query(
  `UPDATE admission_categories SET name=$2, description=$3, sort_order=$4, is_active=$5, updated_at=now() WHERE id=$1`,
  [id, d.name, d.description, d.sortOrder, d.isActive]);

// ---------- campuses ----------
const CAMPUS = `SELECT c.id, c.name, c.code, c.address, c.phone, c.email, c.is_active AS "isActive", c.state_id AS "stateId", s.name AS "stateName"
  FROM campuses c JOIN states s ON s.id = c.state_id`;
const listCampuses = async () => (await query(`${CAMPUS} ORDER BY c.name`)).rows;
const findCampus = async (id, db = { query }) => (await db.query(`${CAMPUS} WHERE c.id = $1`, [id])).rows[0] || null;
async function insertCampus(d, client) {
  const { rows } = await client.query(
    `INSERT INTO campuses (state_id, name, code, address, phone, email) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [d.stateId, d.name, d.code, d.address ?? null, d.phone ?? null, d.email ?? null]);
  return rows[0].id;
}
const updateCampus = (id, d, client) => client.query(
  `UPDATE campuses SET state_id=$2, name=$3, address=$4, phone=$5, email=$6, is_active=$7, updated_at=now() WHERE id=$1`,
  [id, d.stateId, d.name, d.address, d.phone, d.email, d.isActive]);
const stateExists = async (id, db = { query }) => (await db.query(`SELECT 1 FROM states WHERE id = $1`, [id])).rowCount > 0;

// ---------- fee rules ----------
const FEE = `SELECT f.id, f.category_id AS "categoryId", k.name AS "categoryName", f.campus_id AS "campusId", c.name AS "campusName",
  f.state_id AS "stateId", s.name AS "stateName", f.amount_minor::float8 AS "amountMinor", f.currency,
  to_char(f.effective_from,'YYYY-MM-DD') AS "effectiveFrom", to_char(f.effective_to,'YYYY-MM-DD') AS "effectiveTo", f.active, f.notes
  FROM fee_rules f JOIN admission_categories k ON k.id = f.category_id
  LEFT JOIN campuses c ON c.id = f.campus_id LEFT JOIN states s ON s.id = f.state_id`;
const listFees = async () => (await query(`${FEE} ORDER BY k.sort_order, k.name, f.effective_from DESC`)).rows;
const findFee = async (id, db = { query }) => (await db.query(`${FEE} WHERE f.id = $1`, [id])).rows[0] || null;
// Another ACTIVE rule for the same class and place whose dates overlap? (open-ended rules have no end date)
async function overlappingFee({ categoryId, campusId, stateId, from, to, exceptId }, db = { query }) {
  const { rows } = await db.query(
    `SELECT id FROM fee_rules
      WHERE active AND category_id = $1 AND campus_id IS NOT DISTINCT FROM $2 AND state_id IS NOT DISTINCT FROM $3
        AND ($6::uuid IS NULL OR id <> $6)
        AND daterange(effective_from, effective_to, '[]') && daterange($4::date, $5::date, '[]')`,
    [categoryId, campusId ?? null, stateId ?? null, from, to ?? null, exceptId ?? null]);
  return rows.length > 0;
}
async function insertFee(d, client) {
  const { rows } = await client.query(
    `INSERT INTO fee_rules (category_id, campus_id, state_id, amount_minor, currency, effective_from, effective_to, notes)
     VALUES ($1,$2,$3,$4,'NGN',$5,$6,$7) RETURNING id`,
    [d.categoryId, d.campusId ?? null, d.stateId ?? null, d.amountMinor, d.effectiveFrom, d.effectiveTo ?? null, d.notes ?? null]);
  return rows[0].id;
}
const updateFee = (id, d, client) => client.query(
  `UPDATE fee_rules SET amount_minor=$2, effective_to=$3, active=$4, notes=$5, updated_at=now() WHERE id=$1`,
  [id, d.amountMinor, d.effectiveTo, d.active, d.notes]);

// ---------- staff ----------
const STAFF = `SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName", u.phone, u.role, u.is_active AS "isActive",
  u.last_login_at AS "lastLoginAt",
  COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
              FROM user_campus_scopes s JOIN campuses c ON c.id = s.campus_id WHERE s.user_id = u.id), '[]'::json) AS campuses
  FROM users u`;
const listStaff = async () => (await query(`${STAFF} WHERE u.role <> 'applicant' ORDER BY u.is_active DESC, u.first_name, u.last_name`)).rows;
const findStaff = async (id, db = { query }) => (await db.query(`${STAFF} WHERE u.id = $1 AND u.role <> 'applicant'`, [id])).rows[0] || null;
async function insertStaff(d, client) {
  const { rows } = await client.query(
    `INSERT INTO users (email, phone, password_hash, first_name, last_name, role, email_verified_at) VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING id`,
    [d.email, d.phone ?? null, d.passwordHash, d.firstName, d.lastName, d.role]);
  return rows[0].id;
}
const updateStaff = (id, d, client) => client.query(
  `UPDATE users SET first_name=$2, last_name=$3, phone=$4, role=$5, is_active=$6, updated_at=now() WHERE id=$1`,
  [id, d.firstName, d.lastName, d.phone, d.role, d.isActive]);
async function setStaffCampuses(userId, campusIds, client) {
  await client.query(`DELETE FROM user_campus_scopes WHERE user_id = $1`, [userId]);
  if (campusIds.length) await client.query(`INSERT INTO user_campus_scopes (user_id, campus_id) SELECT $1, k FROM unnest($2::uuid[]) AS k`, [userId, campusIds]);
}
const countCampuses = async (ids, db = { query }) => Number((await db.query(`SELECT count(*) FROM campuses WHERE id = ANY($1::uuid[])`, [ids])).rows[0].count);
const setPassword = (id, hash, client) => client.query(
  `UPDATE users SET password_hash=$2, failed_login_count=0, locked_until=NULL, updated_at=now() WHERE id=$1`, [id, hash]);

module.exports = {
  listCycles, findCycle, insertCycle, updateCycle, setCycleCategories, countActiveCategories,
  listCategories, findCategory, insertCategory, updateCategory,
  listCampuses, findCampus, insertCampus, updateCampus, stateExists,
  listFees, findFee, overlappingFee, insertFee, updateFee,
  listStaff, findStaff, insertStaff, updateStaff, setStaffCampuses, countCampuses, setPassword,
};
