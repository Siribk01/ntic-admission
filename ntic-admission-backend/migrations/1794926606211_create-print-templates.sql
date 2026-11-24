-- Up Migration

-- 1. The editable wording used on printed documents. Three pieces of text, one row each:
--    letterhead         the school name and address lines at the top of every PDF
--    exam_instructions  the "bring this, arrive that early" lines on the exam card (one instruction per line)
--    offer_letter       the offer letter (title, body with {{placeholders}}, and who signs it)
CREATE TABLE print_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text NOT NULL UNIQUE,
  title           text,
  body            text NOT NULL,
  signatory_name  text,
  signatory_title text,
  version         integer NOT NULL DEFAULT 1,
  updated_by      uuid REFERENCES users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_templates_key_valid CHECK (key IN ('letterhead', 'exam_instructions', 'offer_letter')),
  CONSTRAINT print_templates_body_size CHECK (btrim(body) <> '' AND length(body) <= 6000),
  CONSTRAINT print_templates_title_size CHECK (title IS NULL OR (btrim(title) <> '' AND length(title) <= 120)),
  CONSTRAINT print_templates_version_positive CHECK (version >= 1)
);

-- 2. Every saved version is kept, so a bad edit can be undone by saving the old text again
CREATE TABLE print_template_versions (
  template_id     uuid NOT NULL REFERENCES print_templates(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  title           text,
  body            text NOT NULL,
  signatory_name  text,
  signatory_title text,
  saved_by        uuid REFERENCES users(id),
  saved_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version)
);

-- 3. Starting wording. Edit it from the admin screen; the school address is deliberately left for you to add.
INSERT INTO print_templates (key, title, body, signatory_name, signatory_title) VALUES
('letterhead', NULL,
 E'Nigerian Tulip International Colleges\nAdmissions Office', NULL, NULL),
('exam_instructions', NULL,
 E'Arrive at least 30 minutes before the exam starts.\nBring this card (printed or on a phone), a passport photograph and a valid ID of the parent or guardian.\nBring pens, pencils, an eraser and a ruler. Calculators and mobile phones are not allowed in the exam hall.\nA candidate who arrives after the exam has started may not be admitted.', NULL, NULL),
('offer_letter', 'Offer of Provisional Admission',
 E'Dear {{parentName}},\n\nWe are pleased to inform you that {{candidateName}} (application number {{applicationNumber}}) has been offered provisional admission to {{categoryName}} at our {{campusName}} campus for the {{academicSession}} academic session.\n\nTo accept this offer, please respond through the admission portal on or before {{offerDeadline}}. An offer that is not accepted by this date will lapse, and the place may be given to another candidate.\n\nCongratulations on this achievement. We look forward to welcoming {{candidateName}} to our school community.',
 'The Admissions Officer', 'Nigerian Tulip International Colleges');

INSERT INTO print_template_versions (template_id, version, title, body, signatory_name, signatory_title)
SELECT id, version, title, body, signatory_name, signatory_title FROM print_templates;

-- 4. The letter exactly as it was first issued. Once a parent has opened their offer letter, later edits to the template
--    must not silently change it. One letter per offer decision.
CREATE TABLE issued_letters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id      uuid NOT NULL REFERENCES decisions(id),
  application_id   uuid NOT NULL REFERENCES applications(id),
  kind             text NOT NULL,
  template_version integer NOT NULL,
  content          jsonb NOT NULL,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issued_letters_kind_valid CHECK (kind IN ('offer_letter')),
  CONSTRAINT issued_letters_one_per_decision UNIQUE (decision_id, kind)
);
CREATE INDEX issued_letters_application_idx ON issued_letters (application_id);

-- Down Migration

DROP TABLE IF EXISTS issued_letters;
DROP TABLE IF EXISTS print_template_versions;
DROP TABLE IF EXISTS print_templates;
