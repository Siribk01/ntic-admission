-- Up Migration

-- 1. Corrections: after an application is submitted the profile is locked. A parent asks for ONE field to be changed; staff decide.
CREATE TABLE application_corrections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  field          text NOT NULL,
  old_value      text,
  new_value      text,
  reason         text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  requested_by   uuid NOT NULL REFERENCES users(id),
  decided_by     uuid REFERENCES users(id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corrections_field_valid CHECK (field IN ('firstName','middleName','surname','dateOfBirth','gender','contactPhone','addressLine')),
  CONSTRAINT corrections_status_valid CHECK (status IN ('pending','approved','rejected','cancelled')),
  CONSTRAINT corrections_reason_size CHECK (btrim(reason) <> '' AND length(reason) <= 500),
  CONSTRAINT corrections_decision_note_size CHECK (decision_note IS NULL OR length(decision_note) <= 500),
  CONSTRAINT corrections_decided_together CHECK ((status IN ('approved','rejected')) = (decided_at IS NOT NULL))
);
-- At most one open request per field per application
CREATE UNIQUE INDEX application_corrections_one_pending_uq ON application_corrections (application_id, field) WHERE status = 'pending';
CREATE INDEX application_corrections_status_idx ON application_corrections (status, created_at);

-- 2. Support requests: a parent asks the school for help, staff reply, and the thread is kept
CREATE TABLE support_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES users(id),
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  category       text NOT NULL,
  subject        text NOT NULL,
  status         text NOT NULL DEFAULT 'open',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz,
  CONSTRAINT support_category_valid CHECK (category IN ('payment','exam','documents','technical','other')),
  CONSTRAINT support_status_valid CHECK (status IN ('open','answered','closed')),
  CONSTRAINT support_subject_size CHECK (btrim(subject) <> '' AND length(subject) <= 120)
);
CREATE INDEX support_requests_parent_idx ON support_requests (parent_user_id, status);
CREATE INDEX support_requests_status_idx ON support_requests (status, updated_at);

CREATE TABLE support_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES users(id),
  from_staff   boolean NOT NULL,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_message_size CHECK (btrim(body) <> '' AND length(body) <= 2000)
);
CREATE INDEX support_messages_request_idx ON support_messages (request_id, created_at);

-- Down Migration
DROP TABLE IF EXISTS support_messages;
DROP TABLE IF EXISTS support_requests;
DROP TABLE IF EXISTS application_corrections;
