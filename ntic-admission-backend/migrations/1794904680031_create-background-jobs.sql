-- Up Migration

-- 1. Settings an administrator can change (FR-055: the unpaid-expiry period is configurable).
-- Only values that were changed are stored here. The defaults live in the code, so an empty table is a normal state.
-- Never store secrets here.
CREATE TABLE settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_key_uq UNIQUE (key),
  CONSTRAINT settings_key_format CHECK (key ~ '^[a-z][a-z0-9_]{1,59}$')
);

-- 2. Reminders that have already been sent. The UNIQUE constraint is what guarantees a parent gets each
-- reminder once, even if two servers run the job at the same moment.
--   kind: what the reminder is
--   ref : what it is about (the payment clock, the offer, the exam booking), so a NEW situation such as a
--         rescheduled exam or a reopened application earns a new reminder
CREATE TABLE reminder_log (
  id             bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  kind           text NOT NULL,
  ref            text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_log_uq UNIQUE (application_id, kind, ref),
  CONSTRAINT reminder_log_kind_valid CHECK (kind IN ('unpaid_expiry_warning', 'offer_reminder', 'exam_reminder'))
);

-- 3. When each background job last ran, so an administrator can see that they are alive
CREATE TABLE job_state (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job              text NOT NULL,
  runs             integer NOT NULL DEFAULT 0,
  last_started_at  timestamptz,
  last_finished_at timestamptz,
  last_processed   integer NOT NULL DEFAULT 0,
  last_error       text,
  CONSTRAINT job_state_job_uq UNIQUE (job),
  CONSTRAINT job_state_job_valid CHECK (job IN ('expire_unpaid', 'expire_offers', 'send_reminders'))
);

-- 4. The expiry job looks at applications waiting for payment
CREATE INDEX applications_waiting_for_payment_idx ON applications (status) WHERE status = 'submitted';

-- Down Migration

DROP INDEX IF EXISTS applications_waiting_for_payment_idx;
DROP TABLE IF EXISTS job_state;
DROP TABLE IF EXISTS reminder_log;
DROP TABLE IF EXISTS settings;
