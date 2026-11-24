-- Up Migration

-- 1. Attendance is part of an exam's history
ALTER TABLE examination_history DROP CONSTRAINT examination_history_action_valid;
ALTER TABLE examination_history ADD CONSTRAINT examination_history_action_valid
  CHECK (action IN ('scheduled', 'rescheduled', 'cancelled', 'attended', 'absent'));

-- 2. One result per examination (FR-034)
CREATE TABLE exam_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES examinations (id) ON DELETE RESTRICT,
  status         text NOT NULL DEFAULT 'draft',
  remarks        text,
  entered_by     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  entered_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_by    uuid REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_results_exam_uq UNIQUE (examination_id),
  CONSTRAINT exam_results_status_valid CHECK (status IN ('draft', 'reviewed')),
  -- reviewed means "somebody looked": both fields set, and never empty on a draft
  CONSTRAINT exam_results_review_shape CHECK (
    (status = 'reviewed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (status = 'draft' AND reviewed_by IS NULL AND reviewed_at IS NULL)),
  -- two people: the one who entered a result cannot be the one who reviews it
  CONSTRAINT exam_results_two_people CHECK (reviewed_by IS NULL OR reviewed_by <> entered_by)
);

-- 3. The marks, one row per subject
CREATE TABLE exam_result_scores (
  result_id uuid NOT NULL REFERENCES exam_results (id) ON DELETE CASCADE,
  subject   text NOT NULL,
  score     numeric(6,2) NOT NULL,
  max_score numeric(6,2) NOT NULL,
  PRIMARY KEY (result_id, subject),
  CONSTRAINT exam_result_scores_subject_format CHECK (subject ~ '^[a-z][a-z0-9_]{1,39}$'),
  CONSTRAINT exam_result_scores_range CHECK (max_score > 0 AND score >= 0 AND score <= max_score)
);

-- 4. Every entry and change, with a full copy of the marks at that moment. Rows are only ever added. (FR-034, BR-008)
CREATE TABLE exam_result_history (
  id         bigserial PRIMARY KEY,
  result_id  uuid NOT NULL REFERENCES exam_results (id) ON DELETE RESTRICT,
  action     text NOT NULL,
  snapshot   jsonb NOT NULL,
  reason     text,
  actor_id   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_result_history_action_valid CHECK (action IN ('recorded', 'changed', 'reviewed'))
);
CREATE INDEX exam_result_history_result_idx ON exam_result_history (result_id, id);

CREATE TRIGGER exam_results_set_updated_at BEFORE UPDATE ON exam_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS exam_result_history;
DROP TABLE IF EXISTS exam_result_scores;
DROP TABLE IF EXISTS exam_results;
ALTER TABLE examination_history DROP CONSTRAINT examination_history_action_valid;
ALTER TABLE examination_history ADD CONSTRAINT examination_history_action_valid
  CHECK (action IN ('scheduled', 'rescheduled', 'cancelled'));
