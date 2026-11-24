-- Up Migration

-- The outbox: every email we intend to send is saved here FIRST, in the same transaction as the business
-- change that caused it. A background worker sends them. If sending fails the row stays and is retried (FR-038).
CREATE TABLE notifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid REFERENCES applications (id) ON DELETE RESTRICT,
  recipient_email  text NOT NULL,
  template         text NOT NULL,
  subject          text NOT NULL,
  body_text        text NOT NULL,
  body_html        text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text,
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_status_valid CHECK (status IN ('pending', 'sent', 'failed')),
  CONSTRAINT notifications_sent_has_time CHECK (status <> 'sent' OR sent_at IS NOT NULL),
  CONSTRAINT notifications_attempts_valid CHECK (attempts >= 0)
);
-- The worker's question: "what is due?"
CREATE INDEX notifications_due_idx ON notifications (next_attempt_at) WHERE status = 'pending';
CREATE INDEX notifications_application_idx ON notifications (application_id);
CREATE INDEX notifications_status_idx ON notifications (status, created_at DESC);

CREATE TRIGGER notifications_set_updated_at BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS notifications;
