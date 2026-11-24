-- Up Migration

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL,
  phone              text,
  password_hash      text NOT NULL,
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  role               text NOT NULL DEFAULT 'applicant',
  is_active          boolean NOT NULL DEFAULT true,
  email_verified_at  timestamptz,
  last_login_at      timestamptz,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_role_valid CHECK (role IN (
    'applicant', 'central_admin', 'campus_officer',
    'finance_officer', 'interviewer', 'reviewer'
  )),
  CONSTRAINT users_email_not_blank CHECK (btrim(email) <> ''),
  CONSTRAINT users_failed_login_count_valid CHECK (failed_login_count >= 0)
);

-- Case-insensitive: Ada@x.com and ada@x.com are the same account
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE user_campus_scopes (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  campus_id  uuid NOT NULL REFERENCES campuses (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, campus_id)
);

-- "Which users can access this campus?" (the primary key already covers "which campuses can this user access?")
CREATE INDEX user_campus_scopes_campus_idx ON user_campus_scopes (campus_id);

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS user_campus_scopes;
DROP TABLE IF EXISTS users;