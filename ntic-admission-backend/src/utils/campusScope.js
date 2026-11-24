// src/utils/campusScope.js
// Which campuses may this staff member work with?
//   null     = all campuses (central administrators)
//   [ids...] = only these campuses (everyone else), possibly an empty list = none

const { query } = require('../db/pool');
const { ROLES } = require('../constants/roles');

async function getCampusScope(user) {
  if (user.role === ROLES.CENTRAL_ADMIN) return null;
  const { rows } = await query(
    'SELECT campus_id FROM user_campus_scopes WHERE user_id = $1',
    [user.id]
  );
  return rows.map((row) => row.campus_id);
}

module.exports = { getCampusScope };
