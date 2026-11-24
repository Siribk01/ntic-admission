-- Up Migration

-- Receipt numbers, e.g. NTIC-RCT-001001
CREATE SEQUENCE receipt_number_seq START 1001;

-- The payment ledger. Rows are never deleted. A mistake is corrected by REVERSING the payment,
-- which keeps the history (who recorded it, who reversed it, and why).
CREATE TABLE payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  amount_minor     bigint NOT NULL,
  currency         text NOT NULL,
  method           text NOT NULL,
  bank_reference   text,
  receipt_number   text NOT NULL,
  status           text NOT NULL DEFAULT 'successful',
  paid_at          timestamptz NOT NULL,
  recorded_by      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  note             text,
  reversed_at      timestamptz,
  reversed_by      uuid REFERENCES users (id) ON DELETE RESTRICT,
  reversal_reason  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT payments_method_valid CHECK (method IN ('cash', 'bank_transfer', 'pos')),
  CONSTRAINT payments_status_valid CHECK (status IN ('successful', 'reversed')),
  CONSTRAINT payments_receipt_uq UNIQUE (receipt_number),
  CONSTRAINT payments_reversal_complete CHECK (
    (status = 'successful' AND reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL)
    OR (status = 'reversed' AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_reason IS NOT NULL)
  ),
  -- Bank transfers and POS slips must carry the bank's reference
  CONSTRAINT payments_reference_needed CHECK (method = 'cash' OR bank_reference IS NOT NULL)
);
CREATE INDEX payments_application_idx ON payments (application_id);
-- The same bank reference cannot be recorded twice (a classic double-entry mistake),
-- unless the first one was reversed.
CREATE UNIQUE INDEX payments_bank_reference_uq
  ON payments (lower(bank_reference)) WHERE bank_reference IS NOT NULL AND status = 'successful';

CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION payments_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Payments cannot be deleted. Reverse the payment instead.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_block_delete();

-- Down Migration

DROP TABLE IF EXISTS payments;
DROP FUNCTION IF EXISTS payments_block_delete();
DROP SEQUENCE IF EXISTS receipt_number_seq;
