-- Up Migration

-- Lets the database enforce "no two fee rules overlap" (used later for fee_rules)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A reusable function that stamps the current time into the updated_at column.
-- Tables that have an updated_at column will use it through a trigger.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration

DROP FUNCTION IF EXISTS set_updated_at();
DROP EXTENSION IF EXISTS btree_gist;