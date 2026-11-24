-- Up Migration

-- A child who is applying. Owned by one parent account (users.id with role 'applicant').
-- One parent can have many applicants (FR-002).
CREATE TABLE applicants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id    uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  first_name        text NOT NULL,
  middle_name       text,
  surname           text NOT NULL,
  date_of_birth     date NOT NULL,
  gender            text NOT NULL,
  nationality       text NOT NULL,
  place_of_birth    text,
  state_of_origin_id uuid REFERENCES states (id) ON DELETE RESTRICT,
  contact_phone     text,
  contact_email     text,
  address_line      text,
  residence_state_id uuid REFERENCES states (id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applicants_gender_valid CHECK (gender IN ('male', 'female')),
  CONSTRAINT applicants_names_not_blank CHECK (btrim(first_name) <> '' AND btrim(surname) <> ''),
  CONSTRAINT applicants_dob_sane CHECK (date_of_birth > DATE '1990-01-01')
);
CREATE INDEX applicants_parent_idx ON applicants (parent_user_id);
-- Stops the same parent entering the same child twice by accident
CREATE UNIQUE INDEX applicants_parent_child_uq
  ON applicants (parent_user_id, lower(first_name), lower(surname), date_of_birth);

-- Father, mother, guardian and emergency contact (FR-006). One row per relationship per applicant.
CREATE TABLE applicant_guardians (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  uuid NOT NULL REFERENCES applicants (id) ON DELETE CASCADE,
  relationship  text NOT NULL,
  full_name     text NOT NULL,
  occupation    text,
  phone         text,
  email         text,
  address       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applicant_guardians_relationship_valid
    CHECK (relationship IN ('father', 'mother', 'guardian', 'emergency_contact')),
  CONSTRAINT applicant_guardians_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT applicant_guardians_one_per_relationship UNIQUE (applicant_id, relationship)
);

-- One applicant's application in one admission cycle. Starts as a draft (FR-003).
-- Fields stay nullable while it is a draft; completeness is checked at submission.
CREATE TABLE applications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id            uuid NOT NULL REFERENCES applicants (id) ON DELETE RESTRICT,
  cycle_id                uuid NOT NULL REFERENCES admission_cycles (id) ON DELETE RESTRICT,
  status                  text NOT NULL DEFAULT 'draft',
  campus_id               uuid REFERENCES campuses (id) ON DELETE RESTRICT,
  category_id             uuid REFERENCES admission_categories (id) ON DELETE RESTRICT,
  program                 text,
  boarding                text,
  heard_from              text[] NOT NULL DEFAULT '{}',
  heard_from_other        text,
  preferred_exam_date     date,
  preferred_exam_time     text,
  preferred_exam_campus_id uuid REFERENCES campuses (id) ON DELETE RESTRICT,
  interview_availability  text,
  consent_given_at        timestamptz,
  consent_version         text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applications_status_valid CHECK (status IN ('draft', 'submitted')),
  CONSTRAINT applications_boarding_valid CHECK (boarding IS NULL OR boarding IN ('day', 'boarding')),
  CONSTRAINT applications_exam_time_valid
    CHECK (preferred_exam_time IS NULL OR preferred_exam_time IN ('morning', 'afternoon')),
  CONSTRAINT applications_heard_from_valid CHECK (heard_from <@ ARRAY[
    'newspaper','television','handbill','banner','friends_relatives','siblings','parent',
    'instagram','facebook','billboard','ntic_staff','educational_website','alumni','other']::text[]),
  CONSTRAINT applications_consent_pair CHECK ((consent_given_at IS NULL) = (consent_version IS NULL)),
  CONSTRAINT applications_one_per_cycle UNIQUE (applicant_id, cycle_id)
);
CREATE INDEX applications_cycle_status_idx ON applications (cycle_id, status);
CREATE INDEX applications_campus_idx ON applications (campus_id);

CREATE TRIGGER applicants_set_updated_at BEFORE UPDATE ON applicants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER applicant_guardians_set_updated_at BEFORE UPDATE ON applicant_guardians
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER applications_set_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS applicant_guardians;
DROP TABLE IF EXISTS applicants;
