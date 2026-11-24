-- Up Migration

-- A sitting of the entrance exam: where, when, and how many seats. (FR-013)
CREATE TABLE exam_slots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id         uuid NOT NULL REFERENCES admission_cycles (id) ON DELETE RESTRICT,
  campus_id        uuid NOT NULL REFERENCES campuses (id) ON DELETE RESTRICT,
  starts_at        timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 120,
  mode             text NOT NULL DEFAULT 'in_person',
  venue            text NOT NULL,
  capacity         integer NOT NULL,
  status           text NOT NULL DEFAULT 'open',
  created_by       uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_slots_mode_valid CHECK (mode IN ('in_person', 'online')),
  CONSTRAINT exam_slots_status_valid CHECK (status IN ('open', 'closed')),
  CONSTRAINT exam_slots_capacity_valid CHECK (capacity BETWEEN 1 AND 2000),
  CONSTRAINT exam_slots_duration_valid CHECK (duration_minutes BETWEEN 15 AND 480),
  CONSTRAINT exam_slots_venue_not_blank CHECK (btrim(venue) <> '')
);
CREATE INDEX exam_slots_lookup_idx ON exam_slots (cycle_id, campus_id, starts_at);

-- Counters for numbers that must never repeat. One row per scope; the row lock makes issuing a number
-- safe even when many staff confirm exams at the same moment. (FR-014)
CREATE TABLE number_counters (
  scope_key  text PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0,
  CONSTRAINT number_counters_non_negative CHECK (last_value >= 0)
);

-- One examination record per application. Its exam number is issued once and never reused.
CREATE TABLE examinations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  exam_number    text NOT NULL,
  slot_id        uuid REFERENCES exam_slots (id) ON DELETE RESTRICT,
  status         text NOT NULL DEFAULT 'scheduled',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT examinations_application_uq UNIQUE (application_id),
  CONSTRAINT examinations_number_uq UNIQUE (exam_number),
  CONSTRAINT examinations_status_valid CHECK (status IN ('scheduled', 'completed', 'absent', 'cancelled')),
  CONSTRAINT examinations_scheduled_has_slot CHECK (status <> 'scheduled' OR slot_id IS NOT NULL)
);
-- Counting seats taken in a slot is the hot query
CREATE INDEX examinations_slot_idx ON examinations (slot_id) WHERE status = 'scheduled';

-- Who scheduled, moved or cancelled each exam, and why (FR-013, FR-028)
CREATE TABLE examination_history (
  id             bigserial PRIMARY KEY,
  examination_id uuid NOT NULL REFERENCES examinations (id) ON DELETE RESTRICT,
  action         text NOT NULL,
  from_slot_id   uuid REFERENCES exam_slots (id) ON DELETE RESTRICT,
  to_slot_id     uuid REFERENCES exam_slots (id) ON DELETE RESTRICT,
  reason         text,
  actor_id       uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT examination_history_action_valid CHECK (action IN ('scheduled', 'rescheduled', 'cancelled'))
);
CREATE INDEX examination_history_exam_idx ON examination_history (examination_id, id);

CREATE TRIGGER exam_slots_set_updated_at BEFORE UPDATE ON exam_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER examinations_set_updated_at BEFORE UPDATE ON examinations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS examination_history;
DROP TABLE IF EXISTS examinations;
DROP TABLE IF EXISTS number_counters;
DROP TABLE IF EXISTS exam_slots;
