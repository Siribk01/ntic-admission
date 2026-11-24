-- Up Migration

-- When staff look at a possible duplicate application and decide "these are different children" (or twins, or a genuine
-- re-application), the decision is remembered so the group stops being listed. The key is a fingerprint of the rule and the exact
-- set of applications, so if a NEW application joins the group it is listed again.
CREATE TABLE duplicate_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_key   text NOT NULL UNIQUE,
  cycle_id    uuid NOT NULL REFERENCES admission_cycles(id),
  rule        text NOT NULL,
  note        text NOT NULL,
  reviewed_by uuid NOT NULL REFERENCES users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duplicate_reviews_rule_valid CHECK (rule IN ('same_name_and_birth_date', 'same_birth_date_and_phone')),
  CONSTRAINT duplicate_reviews_key_format CHECK (match_key ~ '^[0-9a-f]{40}$'),
  CONSTRAINT duplicate_reviews_note_size CHECK (length(btrim(note)) BETWEEN 3 AND 300)
);
CREATE INDEX duplicate_reviews_cycle_idx ON duplicate_reviews (cycle_id);

-- Down Migration

DROP TABLE IF EXISTS duplicate_reviews;
