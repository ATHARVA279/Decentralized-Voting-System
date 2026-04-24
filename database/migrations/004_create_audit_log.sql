-- Migration: 004_create_audit_log
-- Immutable audit log — append-only, tamper-evident transparency layer

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM (
        'user_registered',
        'user_login',
        'user_logout',
        'user_login_failed',
        'election_created',
        'election_updated',
        'election_cancelled',
        'candidate_added',
        'vote_cast',
        'vote_attempt_duplicate',
        'results_viewed',
        'admin_action'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS audit_log (
    id            BIGSERIAL       PRIMARY KEY,  -- Sequential for ordering proof
    action        audit_action    NOT NULL,
    actor_id      UUID            REFERENCES users(id) ON DELETE SET NULL,
    resource_type VARCHAR(50),                  -- 'election', 'vote', 'user', etc.
    resource_id   UUID,
    metadata      JSONB,                        -- Additional context (election_id, candidate_id, etc.)
    ip_address    INET,
    user_agent    TEXT,
    logged_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    -- Chain hash: SHA-256 of (previous_hash || this row's data) for ledger integrity
    row_hash      VARCHAR(64)     NOT NULL
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource   ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logged_at  ON audit_log(logged_at);
CREATE INDEX IF NOT EXISTS idx_audit_metadata   ON audit_log USING gin(metadata);

-- Prevent any UPDATE or DELETE on audit_log (trigger-based enforcement)
CREATE OR REPLACE FUNCTION fn_protect_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records are immutable. UPDATE/DELETE is forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_audit_log_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION fn_protect_audit_log();

CREATE TRIGGER trg_protect_audit_log_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION fn_protect_audit_log();

-- Convenience view for human-readable audit trail
CREATE OR REPLACE VIEW v_audit_trail AS
    SELECT
        al.id,
        al.action,
        u.full_name     AS actor_name,
        u.email         AS actor_email,
        al.resource_type,
        al.resource_id,
        al.metadata,
        al.ip_address,
        al.logged_at,
        al.row_hash
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.actor_id
    ORDER BY al.logged_at DESC;

COMMENT ON TABLE audit_log IS 'Immutable, append-only audit trail. Triggers prevent UPDATE/DELETE. Chain hashes provide tamper detection.';
COMMENT ON COLUMN audit_log.row_hash IS 'SHA-256 of (prev_row_hash || action || actor_id || resource_id || logged_at) — forms a hash chain';
COMMENT ON COLUMN audit_log.id IS 'BIGSERIAL (sequential) allows ordering verification without timestamps alone';

