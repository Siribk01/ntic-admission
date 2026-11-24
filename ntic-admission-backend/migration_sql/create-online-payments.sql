-- Up Migration

-- 1. Online attempts. One row each time a parent starts an online payment. It becomes a real payment only after the
--    gateway has confirmed it to our server (never because of what the browser says).
CREATE TABLE payment_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  provider          text NOT NULL,
  reference         text NOT NULL,
  amount_minor      bigint NOT NULL,
  currency          text NOT NULL,
  status            text NOT NULL DEFAULT 'initiated',
  review_reason     text,
  authorization_url text,
  initiated_by      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  payment_id        uuid,
  gateway_status    text,
  gateway_id        text,
  paid_at           timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_attempts_reference_uq UNIQUE (reference),
  CONSTRAINT payment_attempts_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT payment_attempts_provider_valid CHECK (provider IN ('paystack', 'flutterwave', 'mock')),
  -- needs_review = the gateway took the money but we could not credit it automatically (a person must look)
  CONSTRAINT payment_attempts_status_valid CHECK (status IN ('initiated', 'successful', 'failed', 'abandoned', 'needs_review')),
  CONSTRAINT payment_attempts_success_has_payment CHECK (status <> 'successful' OR payment_id IS NOT NULL),
  CONSTRAINT payment_attempts_review_has_reason CHECK (status <> 'needs_review' OR review_reason IS NOT NULL)
);
CREATE INDEX payment_attempts_application_idx ON payment_attempts (application_id, created_at);
CREATE INDEX payment_attempts_status_idx ON payment_attempts (status, created_at);
CREATE TRIGGER payment_attempts_set_updated_at BEFORE UPDATE ON payment_attempts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Payments: two new methods, and the link back to the online attempt
ALTER TABLE payments ADD COLUMN provider text;
ALTER TABLE payments ADD COLUMN attempt_id uuid REFERENCES payment_attempts (id) ON DELETE RESTRICT;
ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_payment_fk
  FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT;

ALTER TABLE payments DROP CONSTRAINT payments_method_valid;
ALTER TABLE payments ADD CONSTRAINT payments_method_valid
  CHECK (method IN ('cash', 'bank_transfer', 'pos', 'online', 'waiver'));

-- A reference is needed for everything except cash and waivers (for online payments it is our own gateway reference)
ALTER TABLE payments DROP CONSTRAINT payments_reference_needed;
ALTER TABLE payments ADD CONSTRAINT payments_reference_needed
  CHECK (method IN ('cash', 'waiver') OR bank_reference IS NOT NULL);

-- A waiver always says why
ALTER TABLE payments ADD CONSTRAINT payments_waiver_reason CHECK (method <> 'waiver' OR note IS NOT NULL);

-- Online payments always point at their attempt, and nothing else does
ALTER TABLE payments ADD CONSTRAINT payments_online_shape CHECK (
  (method = 'online' AND provider IS NOT NULL AND attempt_id IS NOT NULL)
  OR (method <> 'online' AND provider IS NULL AND attempt_id IS NULL));

-- One payment per attempt, however many times the gateway tells us about it
CREATE UNIQUE INDEX payments_attempt_uq ON payments (attempt_id) WHERE attempt_id IS NOT NULL;

-- 3. Everything a gateway sends us (the "inbox"). Only messages with a valid signature are stored.
--    The unique key stops the same message being processed twice.
CREATE TABLE webhook_events (
  id           bigserial PRIMARY KEY,
  provider     text NOT NULL,
  event_id     text NOT NULL,
  event_type   text,
  reference    text,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'received',
  tries        integer NOT NULL DEFAULT 0,
  last_error   text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT webhook_events_uq UNIQUE (provider, event_id),
  CONSTRAINT webhook_events_status_valid CHECK (status IN ('received', 'processed', 'ignored', 'failed'))
);
CREATE INDEX webhook_events_retry_idx ON webhook_events (status, received_at) WHERE status IN ('received', 'failed');

-- 4. A parent says "I paid by bank transfer, here is the reference". Nothing counts until finance confirms it.
CREATE TABLE payment_claims (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  amount_minor     bigint NOT NULL,
  currency         text NOT NULL,
  bank_reference   text NOT NULL,
  bank_name        text,
  paid_on          date NOT NULL,
  note             text,
  status           text NOT NULL DEFAULT 'pending',
  submitted_by     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_by      uuid REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_at      timestamptz,
  rejection_reason text,
  payment_id       uuid REFERENCES payments (id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_claims_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT payment_claims_status_valid CHECK (status IN ('pending', 'confirmed', 'rejected')),
  CONSTRAINT payment_claims_review_shape CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND payment_id IS NULL AND rejection_reason IS NULL)
    OR (status = 'confirmed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND payment_id IS NOT NULL AND rejection_reason IS NULL)
    OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND payment_id IS NULL AND rejection_reason IS NOT NULL))
);
-- The same reference cannot be claimed twice for one application (a rejected claim may be corrected and sent again)
CREATE UNIQUE INDEX payment_claims_reference_uq ON payment_claims (application_id, lower(bank_reference)) WHERE status IN ('pending', 'confirmed');
CREATE INDEX payment_claims_status_idx ON payment_claims (status, created_at);
CREATE TRIGGER payment_claims_set_updated_at BEFORE UPDATE ON payment_claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. A new background job: re-check online payments whose confirmation never arrived
ALTER TABLE job_state DROP CONSTRAINT job_state_job_valid;
ALTER TABLE job_state ADD CONSTRAINT job_state_job_valid
  CHECK (job IN ('expire_unpaid', 'expire_offers', 'send_reminders', 'reconcile_payments'));

-- Down Migration

DELETE FROM job_state WHERE job = 'reconcile_payments';
ALTER TABLE job_state DROP CONSTRAINT job_state_job_valid;
ALTER TABLE job_state ADD CONSTRAINT job_state_job_valid CHECK (job IN ('expire_unpaid', 'expire_offers', 'send_reminders'));
DROP TABLE IF EXISTS payment_claims;
DROP TABLE IF EXISTS webhook_events;
DROP INDEX IF EXISTS payments_attempt_uq;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_online_shape;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_waiver_reason;
ALTER TABLE payments DROP CONSTRAINT payments_reference_needed;
ALTER TABLE payments ADD CONSTRAINT payments_reference_needed CHECK (method = 'cash' OR bank_reference IS NOT NULL);
ALTER TABLE payments DROP CONSTRAINT payments_method_valid;
ALTER TABLE payments ADD CONSTRAINT payments_method_valid CHECK (method IN ('cash', 'bank_transfer', 'pos'));
ALTER TABLE payment_attempts DROP CONSTRAINT payment_attempts_payment_fk;
ALTER TABLE payments DROP COLUMN attempt_id;
ALTER TABLE payments DROP COLUMN provider;
DROP TABLE IF EXISTS payment_attempts;
