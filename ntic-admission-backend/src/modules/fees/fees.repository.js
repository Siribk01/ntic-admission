// src/modules/fees/fees.repository.js
// SQL only for fee_rules.

const { query } = require('../../db/pool');

// "Today" for fees means today's date in Nigeria, not the server's or the database's clock zone
const TODAY_LAGOS = `(now() AT TIME ZONE 'Africa/Lagos')::date`;

const SELECT_RULE = `
  SELECT fr.id,
         fr.category_id   AS "categoryId",
         ac.name          AS "categoryName",
         fr.state_id      AS "stateId",
         st.name          AS "stateName",
         fr.campus_id     AS "campusId",
         ca.name          AS "campusName",
         CASE WHEN fr.campus_id IS NOT NULL THEN 'campus'
              WHEN fr.state_id  IS NOT NULL THEN 'state'
              ELSE 'category' END AS scope,
         fr.amount_minor  AS "amountMinor",
         fr.currency,
         to_char(fr.effective_from, 'YYYY-MM-DD') AS "effectiveFrom",
         to_char(fr.effective_to,   'YYYY-MM-DD') AS "effectiveTo",
         fr.active,
         fr.notes,
         fr.created_at    AS "createdAt",
         fr.updated_at    AS "updatedAt"
    FROM fee_rules fr
    JOIN admission_categories ac ON ac.id = fr.category_id
    LEFT JOIN states   st ON st.id = fr.state_id
    LEFT JOIN campuses ca ON ca.id = fr.campus_id
`;

async function insertRule(rule, client) {
  const { rows } = await client.query(
    `INSERT INTO fee_rules
       (category_id, state_id, campus_id, amount_minor, effective_from, effective_to, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      rule.categoryId,
      rule.stateId ?? null,
      rule.campusId ?? null,
      rule.amountMinor,
      rule.effectiveFrom,
      rule.effectiveTo ?? null,
      rule.notes ?? null,
    ]
  );
  return rows[0].id;
}

async function findById(id, client) {
  const db = client || { query };
  const { rows } = await db.query(`${SELECT_RULE} WHERE fr.id = $1`, [id]);
  return rows[0] || null;
}

// Locks the rule's row for the rest of the transaction (so two admins cannot change it at once)
async function lockById(id, client) {
  const { rows } = await client.query(
    `SELECT id, active, effective_from AS "effectiveFromDate", effective_to AS "effectiveToDate"
       FROM fee_rules WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return rows[0] || null;
}

// filters: { categoryId?, campusId?, stateId?, active? }. Only fixed text goes in the SQL; values go in params.
async function list(filters) {
  const conditions = [];
  const params = [];
  const add = (sqlWithPlaceholder, value) => {
    params.push(value);
    conditions.push(sqlWithPlaceholder.replace('?', `$${params.length}`));
  };

  if (filters.categoryId) add('fr.category_id = ?', filters.categoryId);
  if (filters.campusId) add('fr.campus_id = ?', filters.campusId);
  if (filters.stateId) add('fr.state_id = ?', filters.stateId);
  if (filters.active !== undefined) add('fr.active = ?', filters.active);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `${SELECT_RULE} ${where} ORDER BY ac.sort_order, ac.name, fr.effective_from DESC, fr.created_at DESC`,
    params
  );
  return rows;
}

// The rule that applies to this campus and category on a date, using the precedence:
//   1. a rule for this exact campus   2. a rule for this campus's state   3. a rule for all campuses
// The no-overlap constraint guarantees at most one match per level, so the most specific one wins.
async function findApplicable({ campusId, stateId, categoryId }) {
  const { rows } = await query(
    `${SELECT_RULE}
      WHERE fr.active
        AND fr.category_id = $3
        AND fr.effective_from <= ${TODAY_LAGOS}
        AND (fr.effective_to IS NULL OR fr.effective_to >= ${TODAY_LAGOS})
        AND (   fr.campus_id = $1
             OR (fr.campus_id IS NULL AND fr.state_id = $2)
             OR (fr.campus_id IS NULL AND fr.state_id IS NULL))
      ORDER BY (fr.campus_id IS NOT NULL) DESC, (fr.state_id IS NOT NULL) DESC
      LIMIT 1`,
    [campusId, stateId, categoryId]
  );
  return rows[0] || null;
}

async function updateRule(id, { effectiveTo, active }, client) {
  const assignments = [];
  const params = [id];
  if (effectiveTo !== undefined) {
    params.push(effectiveTo);
    assignments.push(`effective_to = $${params.length}`);
  }
  if (active !== undefined) {
    params.push(active);
    assignments.push(`active = $${params.length}`);
  }
  if (assignments.length === 0) return;
  await client.query(`UPDATE fee_rules SET ${assignments.join(', ')} WHERE id = $1`, params);
}

// Every active campus + active category pair that has NO fee rule applying today
async function findGaps() {
  const { rows } = await query(
    `SELECT c.id AS "campusId", c.name AS "campusName",
            ac.id AS "categoryId", ac.name AS "categoryName"
       FROM campuses c
      CROSS JOIN admission_categories ac
      WHERE c.is_active AND ac.is_active
        AND NOT EXISTS (
              SELECT 1
                FROM fee_rules fr
               WHERE fr.active
                 AND fr.category_id = ac.id
                 AND fr.effective_from <= ${TODAY_LAGOS}
                 AND (fr.effective_to IS NULL OR fr.effective_to >= ${TODAY_LAGOS})
                 AND (   fr.campus_id = c.id
                      OR (fr.campus_id IS NULL AND fr.state_id = c.state_id)
                      OR (fr.campus_id IS NULL AND fr.state_id IS NULL)))
      ORDER BY c.name, ac.sort_order, ac.name`
  );
  return rows;
}

module.exports = { insertRule, findById, lockById, list, findApplicable, updateRule, findGaps };