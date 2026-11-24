-- Up Migration

CREATE TABLE admission_cycles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  academic_session text NOT NULL,
  status           text NOT NULL DEFAULT 'draft',
  opens_at         timestamptz NOT NULL,
  closes_at        timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admission_cycles_status_valid CHECK (status IN ('draft', 'active', 'closed')),
  CONSTRAINT admission_cycles_dates_valid CHECK (closes_at > opens_at),
  CONSTRAINT admission_cycles_session_format CHECK (academic_session ~ '^[0-9]{4}/[0-9]{4}$'),
  CONSTRAINT admission_cycles_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX admission_cycles_name_uq ON admission_cycles (lower(name));
CREATE INDEX admission_cycles_status_idx ON admission_cycles (status, opens_at);

CREATE TABLE cycle_categories (
  cycle_id           uuid NOT NULL REFERENCES admission_cycles (id) ON DELETE CASCADE,
  category_id        uuid NOT NULL REFERENCES admission_categories (id) ON DELETE RESTRICT,
  interview_required boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, category_id)
);
CREATE INDEX cycle_categories_category_idx ON cycle_categories (category_id);

CREATE TRIGGER admission_cycles_set_updated_at BEFORE UPDATE ON admission_cycles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS cycle_categories;
DROP TABLE IF EXISTS admission_cycles;