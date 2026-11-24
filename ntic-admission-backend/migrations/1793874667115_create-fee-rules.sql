-- Up Migration

CREATE TABLE fee_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id    uuid NOT NULL REFERENCES admission_categories (id) ON DELETE RESTRICT,
  state_id       uuid REFERENCES states (id) ON DELETE RESTRICT,
  campus_id      uuid REFERENCES campuses (id) ON DELETE RESTRICT,
  amount_minor   bigint NOT NULL,
  currency       text NOT NULL DEFAULT 'NGN',
  effective_from date NOT NULL,
  effective_to   date,
  active         boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fee_rules_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT fee_rules_currency_valid CHECK (currency IN ('NGN')),
  CONSTRAINT fee_rules_dates_valid CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT fee_rules_scope_valid CHECK (NOT (state_id IS NOT NULL AND campus_id IS NOT NULL)),
  CONSTRAINT fee_rules_no_overlap EXCLUDE USING gist (
    category_id WITH =,
    COALESCE(campus_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    COALESCE(state_id,  '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  ) WHERE (active)
);

CREATE INDEX fee_rules_lookup_idx ON fee_rules (category_id, campus_id, state_id) WHERE active;

CREATE TRIGGER fee_rules_set_updated_at BEFORE UPDATE ON fee_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS fee_rules;