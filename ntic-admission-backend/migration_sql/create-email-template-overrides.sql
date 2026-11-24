-- Up Migration

-- Optional replacement wording for the automatic emails. No row = the built-in wording is used.
-- Emails that carry sign-in links (verify_email, password_reset) can never be overridden: the application refuses them.
CREATE TABLE email_template_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  subject      text NOT NULL,
  body         text NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  version      integer NOT NULL DEFAULT 1,
  updated_by   uuid REFERENCES users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_overrides_subject_size CHECK (btrim(subject) <> '' AND length(subject) <= 150),
  CONSTRAINT email_overrides_body_size CHECK (btrim(body) <> '' AND length(body) <= 4000),
  CONSTRAINT email_overrides_version_positive CHECK (version >= 1)
);

-- Every saved version is kept so a bad edit can be undone
CREATE TABLE email_template_override_versions (
  override_id uuid NOT NULL REFERENCES email_template_overrides(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  enabled     boolean NOT NULL,
  saved_by    uuid REFERENCES users(id),
  saved_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (override_id, version)
);

-- Down Migration
DROP TABLE IF EXISTS email_template_override_versions;
DROP TABLE IF EXISTS email_template_overrides;
