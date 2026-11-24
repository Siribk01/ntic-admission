// src/modules/applicants/applicants.repository.js
// SQL only for applicants and their guardians. Every read that a parent can reach also filters
// by parent_user_id, so one parent can never reach another parent's child by guessing an id.

const { query } = require('../../db/pool');

const SELECT_APPLICANT = `
  SELECT a.id,
         a.first_name        AS "firstName",
         a.middle_name       AS "middleName",
         a.surname,
         to_char(a.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
         a.gender,
         a.nationality,
         a.place_of_birth    AS "placeOfBirth",
         a.state_of_origin_id AS "stateOfOriginId",
         a.contact_phone     AS "contactPhone",
         a.contact_email     AS "contactEmail",
         a.address_line      AS "addressLine",
         a.residence_state_id AS "residenceStateId",
         a.created_at        AS "createdAt",
         a.updated_at        AS "updatedAt"
    FROM applicants a
`;

const SELECT_GUARDIAN = `
  SELECT relationship,
         full_name  AS "fullName",
         occupation, phone, email, address,
         updated_at AS "updatedAt"
    FROM applicant_guardians
`;

const COLUMN_FOR_FIELD = {
  firstName: 'first_name',
  middleName: 'middle_name',
  surname: 'surname',
  dateOfBirth: 'date_of_birth',
  gender: 'gender',
  nationality: 'nationality',
  placeOfBirth: 'place_of_birth',
  stateOfOriginId: 'state_of_origin_id',
  contactPhone: 'contact_phone',
  contactEmail: 'contact_email',
  addressLine: 'address_line',
  residenceStateId: 'residence_state_id',
};

async function insert(parentUserId, data) {
  const { rows } = await query(
    `INSERT INTO applicants
       (parent_user_id, first_name, middle_name, surname, date_of_birth, gender, nationality,
        place_of_birth, state_of_origin_id, contact_phone, contact_email, address_line, residence_state_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      parentUserId, data.firstName, data.middleName ?? null, data.surname, data.dateOfBirth,
      data.gender, data.nationality, data.placeOfBirth ?? null, data.stateOfOriginId ?? null,
      data.contactPhone ?? null, data.contactEmail ?? null, data.addressLine ?? null,
      data.residenceStateId ?? null,
    ]
  );
  return rows[0].id;
}

// Returns null when the applicant does not exist OR belongs to someone else (same answer on purpose)
async function findOwned(applicantId, parentUserId) {
  const { rows } = await query(
    `${SELECT_APPLICANT} WHERE a.id = $1 AND a.parent_user_id = $2`,
    [applicantId, parentUserId]
  );
  return rows[0] || null;
}

async function listByParent(parentUserId) {
  const { rows } = await query(
    `${SELECT_APPLICANT} WHERE a.parent_user_id = $1 ORDER BY a.created_at`,
    [parentUserId]
  );
  return rows;
}

async function update(applicantId, parentUserId, data) {
  const sets = [];
  const params = [applicantId, parentUserId];
  for (const [field, column] of Object.entries(COLUMN_FOR_FIELD)) {
    if (data[field] !== undefined) {
      params.push(data[field]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (sets.length === 0) return;
  await query(
    `UPDATE applicants SET ${sets.join(', ')} WHERE id = $1 AND parent_user_id = $2`,
    params
  );
}

async function listGuardians(applicantId) {
  const { rows } = await query(
    `${SELECT_GUARDIAN} WHERE applicant_id = $1 ORDER BY relationship`,
    [applicantId]
  );
  return rows;
}

// Insert, or replace the details if that relationship already exists for this applicant
async function upsertGuardian(applicantId, relationship, data) {
  const { rows } = await query(
    `INSERT INTO applicant_guardians (applicant_id, relationship, full_name, occupation, phone, email, address)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (applicant_id, relationship) DO UPDATE
       SET full_name = EXCLUDED.full_name, occupation = EXCLUDED.occupation, phone = EXCLUDED.phone,
           email = EXCLUDED.email, address = EXCLUDED.address
     RETURNING relationship, full_name AS "fullName", occupation, phone, email, address`,
    [applicantId, relationship, data.fullName, data.occupation ?? null, data.phone ?? null,
     data.email ?? null, data.address ?? null]
  );
  return rows[0];
}

async function deleteGuardian(applicantId, relationship) {
  const { rowCount } = await query(
    `DELETE FROM applicant_guardians WHERE applicant_id = $1 AND relationship = $2`,
    [applicantId, relationship]
  );
  return rowCount > 0;
}

// Which of these states exist and are active? (used to validate state of origin / residence)
async function findActiveStateIds(stateIds) {
  const { rows } = await query(
    `SELECT id FROM states WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [stateIds]
  );
  return rows.map((r) => r.id);
}

module.exports = {
  insert, findOwned, listByParent, update,
  listGuardians, upsertGuardian, deleteGuardian, findActiveStateIds,
};
