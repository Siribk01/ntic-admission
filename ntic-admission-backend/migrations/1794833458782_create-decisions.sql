-- Up Migration

-- 1. The application track now has ten values (SRS section 3.1)
ALTER TABLE applications DROP CONSTRAINT applications_status_valid;
ALTER TABLE applications ADD CONSTRAINT applications_status_valid CHECK (status IN (
  'draft', 'submitted', 'under_review', 'information_required', 'decision_pending',
  'offered', 'waitlisted', 'rejected', 'withdrawn', 'closed'));

-- 2. Every status change, with who and why (FR-028). Rows are only ever added.
CREATE TABLE application_status_history (
  id             bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  from_status    text,
  to_status      text NOT NULL,
  actor_id       uuid REFERENCES users (id) ON DELETE RESTRICT,
  reason         text,        -- internal
  public_note    text,        -- shown to the parent on their timeline
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_status_history_app_idx ON application_status_history (application_id, id);

-- 3. Decisions. An application can have several over time (waitlisted first, offered later); the latest counts.
CREATE TABLE decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  outcome         text NOT NULL,
  reason_code     text,
  notes           text,        -- internal, never shown to the parent
  public_message  text,        -- shown to the parent
  offer_deadline  date,        -- offers only: the last day the parent may respond (Lagos time)
  response        text,        -- offers only: pending, accepted, declined, expired
  responded_at    timestamptz,
  decided_by      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decided_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decisions_outcome_valid CHECK (outcome IN ('offered', 'waitlisted', 'rejected')),
  CONSTRAINT decisions_response_valid CHECK (response IS NULL OR response IN ('pending', 'accepted', 'declined', 'expired')),
  CONSTRAINT decisions_offer_shape CHECK (
    (outcome = 'offered' AND offer_deadline IS NOT NULL AND response IS NOT NULL)
    OR (outcome <> 'offered' AND offer_deadline IS NULL AND response IS NULL AND responded_at IS NULL)),
  CONSTRAINT decisions_reason_code_format CHECK (reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{1,39}$')
);
CREATE INDEX decisions_application_idx ON decisions (application_id, decided_at DESC);
-- Only one open offer per application at any time
CREATE UNIQUE INDEX decisions_one_pending_offer_uq ON decisions (application_id) WHERE response = 'pending';

-- 4. Applications that already exist: record their history, and move paid ones into review
INSERT INTO application_status_history (application_id, from_status, to_status, reason, created_at)
  SELECT id, 'draft', 'submitted', 'Recorded when status history was introduced', submitted_at
    FROM applications WHERE status = 'submitted';

INSERT INTO application_status_history (application_id, from_status, to_status, reason)
  SELECT ap.id, 'submitted', 'under_review', 'Fee already paid when status history was introduced'
    FROM applications ap
   WHERE ap.status = 'submitted'
     AND COALESCE((SELECT SUM(p.amount_minor) FROM payments p
                    WHERE p.application_id = ap.id AND p.status = 'successful'), 0) >= ap.fee_amount_minor;

UPDATE applications ap SET status = 'under_review'
 WHERE ap.status = 'submitted'
   AND COALESCE((SELECT SUM(p.amount_minor) FROM payments p
                  WHERE p.application_id = ap.id AND p.status = 'successful'), 0) >= ap.fee_amount_minor;

-- Down Migration

UPDATE applications SET status = 'submitted' WHERE status NOT IN ('draft', 'submitted');
ALTER TABLE applications DROP CONSTRAINT applications_status_valid;
ALTER TABLE applications ADD CONSTRAINT applications_status_valid CHECK (status IN ('draft', 'submitted'));
DROP TABLE IF EXISTS decisions;
DROP TABLE IF EXISTS application_status_history;
