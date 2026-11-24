-- Up Migration

CREATE TABLE audit_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_email   text,
  actor_role    text,
  action        text NOT NULL,
  outcome       text NOT NULL DEFAULT 'success',
  resource_type text,
  resource_id   text,
  ip_address    text,
  user_agent    text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT audit_logs_outcome_valid CHECK (outcome IN ('success', 'failure')),
  CONSTRAINT audit_logs_action_not_blank CHECK (btrim(action) <> '')
);

CREATE INDEX audit_logs_occurred_idx ON audit_logs (occurred_at DESC);
CREATE INDEX audit_logs_actor_idx    ON audit_logs (actor_user_id, id DESC);
CREATE INDEX audit_logs_action_idx   ON audit_logs (action, id DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id);

-- Append-only: any attempt to change or remove a log entry is refused by the database itself
CREATE FUNCTION audit_logs_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_changes();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_changes();

-- Down Migration

DROP TABLE IF EXISTS audit_logs;
DROP FUNCTION IF EXISTS audit_logs_block_changes();