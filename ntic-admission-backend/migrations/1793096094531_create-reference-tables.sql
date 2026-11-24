-- Up Migration

CREATE TABLE states (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  code       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT states_code_uq UNIQUE (code),
  CONSTRAINT states_code_format CHECK (code ~ '^[A-Z]{2,3}$'),
  CONSTRAINT states_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX states_name_uq ON states (lower(name));

CREATE TABLE campuses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id   uuid NOT NULL REFERENCES states (id) ON DELETE RESTRICT,
  name       text NOT NULL,
  code       text NOT NULL,
  address    text,
  phone      text,
  email      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campuses_code_uq UNIQUE (code),
  CONSTRAINT campuses_code_format CHECK (code ~ '^[A-Z0-9]{2,10}$'),
  CONSTRAINT campuses_name_not_blank CHECK (btrim(name) <> '')
);
-- No two campuses with the same name in the same state.
-- This index also speeds up "all campuses in a state", because state_id is its first column.
CREATE UNIQUE INDEX campuses_state_name_uq ON campuses (state_id, lower(name));

CREATE TABLE admission_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admission_categories_code_uq UNIQUE (code),
  CONSTRAINT admission_categories_code_format CHECK (code ~ '^[A-Z0-9_]{2,20}$'),
  CONSTRAINT admission_categories_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX admission_categories_name_uq ON admission_categories (lower(name));

-- Keep updated_at correct automatically (uses the function from the first migration)
CREATE TRIGGER states_set_updated_at BEFORE UPDATE ON states
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER campuses_set_updated_at BEFORE UPDATE ON campuses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER admission_categories_set_updated_at BEFORE UPDATE ON admission_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

-- Drop in reverse order: campuses depends on states. Triggers are dropped with their tables.
DROP TABLE IF EXISTS campuses;
DROP TABLE IF EXISTS admission_categories;
DROP TABLE IF EXISTS states;