// src/modules/cycles/cycles.repository.js
// SQL only for admission_cycles and cycle_categories.

const { query } = require('../../db/pool');

// One definition of "this cycle can take applications right now".
// It is computed here, never stored, so it can never be out of date.
const SELECT_CYCLE = `
  SELECT c.id,
         c.name,
         c.academic_session AS "academicSession",
         c.status,
         c.opens_at  AS "opensAt",
         c.closes_at AS "closesAt",
         (c.status = 'active' AND now() >= c.opens_at AND now() < c.closes_at) AS "isAcceptingApplications",
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt",
         COALESCE((
           SELECT json_agg(
                    json_build_object(
                      'categoryId', cc.category_id,
                      'name', ac.name,
                      'code', ac.code,
                      'interviewRequired', cc.interview_required
                    )
                    ORDER BY ac.sort_order, ac.name
                  )
             FROM cycle_categories cc
             JOIN admission_categories ac ON ac.id = cc.category_id
            WHERE cc.cycle_id = c.id
         ), '[]'::json) AS categories
    FROM admission_cycles c
`;

// The only columns that may be changed through updateFields (maps API names to column names)
const UPDATABLE_COLUMNS = {
  name: 'name',
  academicSession: 'academic_session',
  opensAt: 'opens_at',
  closesAt: 'closes_at',
};

async function insertCycle({ name, academicSession, opensAt, closesAt }, client) {
  const db = client || { query };
  const { rows } = await db.query(
    `INSERT INTO admission_cycles (name, academic_session, opens_at, closes_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [name, academicSession, opensAt, closesAt]
  );
  return rows[0].id;
}

// categories: [{ categoryId, interviewRequired }]
async function insertCycleCategories(cycleId, categories, client) {
  const db = client || { query };
  await db.query(
    `INSERT INTO cycle_categories (cycle_id, category_id, interview_required)
     SELECT $1, category_id, interview_required
       FROM unnest($2::uuid[], $3::boolean[]) AS t(category_id, interview_required)`,
    [
      cycleId,
      categories.map((c) => c.categoryId),
      categories.map((c) => c.interviewRequired === true),
    ]
  );
}

// Replaces the cycle's whole category list (call inside a transaction)
async function replaceCycleCategories(cycleId, categories, client) {
  await client.query(`DELETE FROM cycle_categories WHERE cycle_id = $1`, [cycleId]);
  await insertCycleCategories(cycleId, categories, client);
}

// Locks the cycle's row until the transaction ends, and returns its current state.
// While locked, nobody else can change it, so "check the state, then change it" cannot be interleaved
// with another administrator doing the same thing.
async function lockById(id, client) {
  const { rows } = await client.query(
    `SELECT id, status, opens_at AS "opensAt", closes_at AS "closesAt"
       FROM admission_cycles
      WHERE id = $1
        FOR UPDATE`,
    [id]
  );
  return rows[0] || null;
}

// fields: { name?, academicSession?, opensAt?, closesAt? }. Column names come from the list above, never from user input.
async function updateFields(id, fields, client) {
  const assignments = [];
  const params = [id];

  for (const [key, value] of Object.entries(fields)) {
    const column = UPDATABLE_COLUMNS[key];
    if (!column) {
      throw new Error(`Cannot update field "${key}"`);
    }
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  }

  if (assignments.length === 0) return;

  await client.query(
    `UPDATE admission_cycles SET ${assignments.join(', ')} WHERE id = $1`,
    params
  );
}

async function setStatus(id, status, client) {
  await client.query(`UPDATE admission_cycles SET status = $2 WHERE id = $1`, [id, status]);
}

// `client` lets us read the cycle back inside the same transaction that changed it
async function findById(id, client) {
  const db = client || { query };
  const { rows } = await db.query(`${SELECT_CYCLE} WHERE c.id = $1`, [id]);
  return rows[0] || null;
}

// For administrators: every cycle, newest first
async function listAll() {
  const { rows } = await query(`${SELECT_CYCLE} ORDER BY c.opens_at DESC, c.created_at DESC`);
  return rows;
}

// For the public: only cycles an administrator has made active (a draft or closed cycle is hidden)
async function listActive() {
  const { rows } = await query(`${SELECT_CYCLE} WHERE c.status = 'active' ORDER BY c.opens_at ASC`);
  return rows;
}

module.exports = {
  insertCycle,
  insertCycleCategories,
  replaceCycleCategories,
  lockById,
  updateFields,
  setStatus,
  findById,
  listAll,
  listActive,
};