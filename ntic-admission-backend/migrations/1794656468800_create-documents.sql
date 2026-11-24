-- Up Migration

-- The checklist of documents an applicant can be asked for (FR-027).
-- NTIC controls it: required or optional, which file types, and the size limit.
CREATE TABLE document_types (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL,
  name           text NOT NULL,
  required       boolean NOT NULL DEFAULT false,
  allowed_mimes  text[] NOT NULL,
  max_bytes      integer NOT NULL,
  sort_order     integer NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_types_code_uq UNIQUE (code),
  CONSTRAINT document_types_code_format CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  CONSTRAINT document_types_mimes_valid CHECK (
    cardinality(allowed_mimes) > 0
    AND allowed_mimes <@ ARRAY['image/jpeg', 'image/png', 'application/pdf']::text[]),
  CONSTRAINT document_types_size_valid CHECK (max_bytes BETWEEN 10240 AND 5242880)
);
CREATE TRIGGER document_types_set_updated_at BEFORE UPDATE ON document_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- PLACEHOLDER checklist: replace with NTIC's real list (FR-027 is still to be confirmed with them)
INSERT INTO document_types (code, name, required, allowed_mimes, max_bytes, sort_order) VALUES
  ('passport_photo',    'Passport photograph',      true,  ARRAY['image/jpeg','image/png'],                  2097152, 1),
  ('birth_certificate', 'Birth certificate',        true,  ARRAY['image/jpeg','image/png','application/pdf'], 5242880, 2),
  ('previous_result',   'Previous school result',   false, ARRAY['image/jpeg','image/png','application/pdf'], 5242880, 3);

-- One uploaded file per document type per application. The file itself is on disk under a random name;
-- this table is the record of what it is and who it belongs to.
CREATE TABLE application_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL REFERENCES applications (id) ON DELETE RESTRICT,
  document_type_id uuid NOT NULL REFERENCES document_types (id) ON DELETE RESTRICT,
  original_name    text NOT NULL,
  stored_name      text NOT NULL,
  mime_type        text NOT NULL,
  size_bytes       integer NOT NULL,
  sha256           text NOT NULL,
  uploaded_by      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_documents_one_per_type UNIQUE (application_id, document_type_id),
  CONSTRAINT application_documents_stored_name_uq UNIQUE (stored_name),
  CONSTRAINT application_documents_size_positive CHECK (size_bytes > 0)
);
CREATE TRIGGER application_documents_set_updated_at BEFORE UPDATE ON application_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS application_documents;
DROP TABLE IF EXISTS document_types;
