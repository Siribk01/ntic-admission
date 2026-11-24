-- Up Migration

-- 1. Needed so the database itself can refuse two overlapping interviews for the same interviewer
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. A new staff role: interviewer. How the role is stored differs between projects, so this handles both ways:
--    a PostgreSQL enum type (adds a value) or a CHECK constraint (replaced by one that also allows 'interviewer').
--    If your users table allows roles that are not in the list below, the CHECK replacement fails and the whole
--    migration is rolled back, so nothing is half done. Tell me if that happens.
DO $$
DECLARE
  col_type text;
  col_udt  text;
  c record;
BEGIN
  SELECT data_type, udt_name INTO col_type, col_udt
    FROM information_schema.columns
   WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'role';

  IF col_type = 'USER-DEFINED' THEN
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', col_udt, 'interviewer');
  ELSE
    FOR c IN
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'users'::regclass AND contype = 'c'
         AND pg_get_constraintdef(oid) ~ '^CHECK \(\(+(\w+\.)?"?role"?\)?(::text)? = ANY'
    LOOP
      EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', c.conname);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_role_valid') THEN
      ALTER TABLE users DROP CONSTRAINT users_role_valid;
    END IF;
    ALTER TABLE users ADD CONSTRAINT users_role_valid
      CHECK (role IN ('applicant', 'central_admin', 'finance_officer', 'campus_officer', 'reviewer', 'interviewer'));
  END IF;
END $$;

-- 3. The interview itself: at most one per application (FR-029)
CREATE TABLE interviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  interviewer_id   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status           text NOT NULL DEFAULT 'scheduled',
  starts_at        timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  ends_at          timestamptz NOT NULL,
  timezone         text NOT NULL DEFAULT 'Africa/Lagos',
  platform         text NOT NULL,
  meeting_url      text,
  instructions     text,
  created_by       uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interviews_application_uq UNIQUE (application_id),
  CONSTRAINT interviews_status_valid CHECK (status IN ('scheduled', 'completed', 'absent', 'cancelled')),
  CONSTRAINT interviews_platform_valid CHECK (platform IN ('google_meet', 'microsoft_teams', 'zoom', 'phone', 'other')),
  CONSTRAINT interviews_duration_valid CHECK (duration_minutes BETWEEN 10 AND 240),
  CONSTRAINT interviews_end_matches CHECK (ends_at = starts_at + duration_minutes * interval '1 minute'),
  CONSTRAINT interviews_url_https CHECK (meeting_url IS NULL OR meeting_url ~ '^https://'),
  CONSTRAINT interviews_link_needed CHECK (platform = 'phone' OR meeting_url IS NOT NULL),
  -- FR-031: the same interviewer can never be in two scheduled interviews that overlap in time
  CONSTRAINT interviews_no_overlap EXCLUDE USING gist (
    interviewer_id WITH =, tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status = 'scheduled')
);
CREATE INDEX interviews_interviewer_idx ON interviews (interviewer_id, starts_at);
CREATE INDEX interviews_starts_idx ON interviews (starts_at);
CREATE TRIGGER interviews_set_updated_at BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Everything that ever happened to an interview. Rows are only added.
CREATE TABLE interview_history (
  id                 bigserial PRIMARY KEY,
  interview_id       uuid NOT NULL REFERENCES interviews (id) ON DELETE RESTRICT,
  action             text NOT NULL,
  from_starts_at     timestamptz,
  to_starts_at       timestamptz,
  from_interviewer_id uuid REFERENCES users (id) ON DELETE RESTRICT,
  to_interviewer_id  uuid REFERENCES users (id) ON DELETE RESTRICT,
  reason             text,
  actor_id           uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_history_action_valid CHECK (action IN ('scheduled', 'rescheduled', 'cancelled', 'completed', 'absent'))
);
CREATE INDEX interview_history_interview_idx ON interview_history (interview_id, id);

-- 5. The questions on the scorecard (FR-033). An administrator edits these; scorecards keep their own copy of the
--    label and maximum, so changing a criterion later never rewrites a past scorecard.
CREATE TABLE scorecard_criteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  label       text NOT NULL,
  description text,
  max_score   integer NOT NULL DEFAULT 5,
  position    integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scorecard_criteria_key_uq UNIQUE (key),
  CONSTRAINT scorecard_criteria_key_format CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  CONSTRAINT scorecard_criteria_max_valid CHECK (max_score BETWEEN 1 AND 100)
);
CREATE TRIGGER scorecard_criteria_set_updated_at BEFORE UPDATE ON scorecard_criteria
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO scorecard_criteria (key, label, description, max_score, position) VALUES
  ('communication', 'Communication', 'Speaks clearly and listens well', 5, 1),
  ('reasoning', 'Reasoning', 'Thinks through questions and explains answers', 5, 2),
  ('confidence', 'Confidence and attitude', 'Calm, respectful and willing to try', 5, 3),
  ('learning_readiness', 'Readiness to learn', 'Curiosity and interest in school', 5, 4),
  ('home_support', 'Family support', 'Parent or guardian is engaged and supportive', 5, 5);

-- 6. One scorecard per interview
CREATE TABLE interview_scorecards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id   uuid NOT NULL REFERENCES interviews (id) ON DELETE RESTRICT,
  status         text NOT NULL DEFAULT 'draft',
  recommendation text,
  notes          text,
  written_by     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  submitted_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_scorecards_interview_uq UNIQUE (interview_id),
  CONSTRAINT interview_scorecards_status_valid CHECK (status IN ('draft', 'submitted')),
  CONSTRAINT interview_scorecards_recommendation_valid
    CHECK (recommendation IS NULL OR recommendation IN ('strongly_recommend', 'recommend', 'neutral', 'not_recommended')),
  -- a submitted scorecard is complete and stamped; a draft is neither
  CONSTRAINT interview_scorecards_submit_shape CHECK (
    (status = 'submitted' AND recommendation IS NOT NULL AND submitted_at IS NOT NULL)
    OR (status = 'draft' AND submitted_at IS NULL))
);
CREATE TRIGGER interview_scorecards_set_updated_at BEFORE UPDATE ON interview_scorecards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE interview_scorecard_scores (
  scorecard_id  uuid NOT NULL REFERENCES interview_scorecards (id) ON DELETE CASCADE,
  criterion_key text NOT NULL,
  label         text NOT NULL,
  max_score     integer NOT NULL,
  score         integer NOT NULL,
  comment       text,
  PRIMARY KEY (scorecard_id, criterion_key),
  CONSTRAINT interview_scorecard_scores_range CHECK (max_score >= 1 AND score >= 0 AND score <= max_score)
);

-- Submitted and reopened scorecards, with a full copy at that moment. Rows are only added.
CREATE TABLE interview_scorecard_history (
  id            bigserial PRIMARY KEY,
  scorecard_id  uuid NOT NULL REFERENCES interview_scorecards (id) ON DELETE RESTRICT,
  action        text NOT NULL,
  snapshot      jsonb NOT NULL,
  reason        text,
  actor_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_scorecard_history_action_valid CHECK (action IN ('submitted', 'reopened'))
);
CREATE INDEX interview_scorecard_history_idx ON interview_scorecard_history (scorecard_id, id);

-- 7. Interview reminders use the same once-only log as the other reminders
ALTER TABLE reminder_log DROP CONSTRAINT reminder_log_kind_valid;
ALTER TABLE reminder_log ADD CONSTRAINT reminder_log_kind_valid
  CHECK (kind IN ('unpaid_expiry_warning', 'offer_reminder', 'exam_reminder', 'interview_reminder'));

-- Down Migration

ALTER TABLE reminder_log DROP CONSTRAINT reminder_log_kind_valid;
ALTER TABLE reminder_log ADD CONSTRAINT reminder_log_kind_valid
  CHECK (kind IN ('unpaid_expiry_warning', 'offer_reminder', 'exam_reminder'));
DROP TABLE IF EXISTS interview_scorecard_history;
DROP TABLE IF EXISTS interview_scorecard_scores;
DROP TABLE IF EXISTS interview_scorecards;
DROP TABLE IF EXISTS scorecard_criteria;
DROP TABLE IF EXISTS interview_history;
DROP TABLE IF EXISTS interviews;
-- (the interviewer role and the btree_gist extension are left in place on purpose)
