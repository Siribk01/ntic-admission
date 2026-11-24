-- Up Migration

-- Numbers for submitted applications, e.g. NTIC-2026-001001. A sequence never hands out the same number twice,
-- even when many parents submit at the same moment. (Gaps can appear if a submission is rolled back; that is normal.)
CREATE SEQUENCE application_number_seq START 1001;

ALTER TABLE applications
  ADD COLUMN submitted_at       timestamptz,
  ADD COLUMN application_number text,
  -- The fee is COPIED onto the application at submission (a snapshot), so later changes to fee rules
  -- never change what this family was asked to pay.
  ADD COLUMN fee_amount_minor   bigint,
  ADD COLUMN fee_currency       text,
  ADD COLUMN fee_rule_id        uuid REFERENCES fee_rules (id) ON DELETE RESTRICT;

ALTER TABLE applications
  ADD CONSTRAINT applications_number_uq UNIQUE (application_number),
  ADD CONSTRAINT applications_fee_positive CHECK (fee_amount_minor IS NULL OR fee_amount_minor > 0),
  -- A submitted application must carry its number, time and fee snapshot
  ADD CONSTRAINT applications_submitted_complete CHECK (
    status = 'draft'
    OR (submitted_at IS NOT NULL AND application_number IS NOT NULL
        AND fee_amount_minor IS NOT NULL AND fee_currency IS NOT NULL AND fee_rule_id IS NOT NULL)
  );

-- Down Migration

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_submitted_complete,
  DROP CONSTRAINT IF EXISTS applications_fee_positive,
  DROP CONSTRAINT IF EXISTS applications_number_uq,
  DROP COLUMN IF EXISTS fee_rule_id,
  DROP COLUMN IF EXISTS fee_currency,
  DROP COLUMN IF EXISTS fee_amount_minor,
  DROP COLUMN IF EXISTS application_number,
  DROP COLUMN IF EXISTS submitted_at;
DROP SEQUENCE IF EXISTS application_number_seq;