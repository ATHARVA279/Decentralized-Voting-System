-- Migration: 001_create_users
-- Creates the users table with role-based access control

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('student', 'admin', 'observer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    student_id    VARCHAR(50)  UNIQUE,
    department    VARCHAR(100),
    role          user_role    NOT NULL DEFAULT 'student',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id);
CREATE INDEX IF NOT EXISTS idx_users_role       ON users(role);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at();

-- Refresh tokens table for JWT rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256 of token
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked    BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens(token_hash);

COMMENT ON TABLE users IS 'Stores all system users: students, admins, and observers';
COMMENT ON COLUMN users.student_id IS 'University-assigned student ID, null for admins';
COMMENT ON COLUMN users.role IS 'student: can vote; admin: manages elections; observer: read-only';


-- Migration: 002_create_elections
-- Creates elections and candidates tables

DO $$ BEGIN 
    CREATE TYPE election_status AS ENUM ('draft', 'upcoming', 'active', 'completed', 'cancelled'); 
EXCEPTION 
    WHEN duplicate_object THEN null; 
END $$;

CREATE TABLE IF NOT EXISTS elections (
    id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    title            VARCHAR(255)     NOT NULL,
    description      TEXT,
    start_time       TIMESTAMPTZ      NOT NULL,
    end_time         TIMESTAMPTZ      NOT NULL,
    status           election_status  NOT NULL DEFAULT 'draft',
    created_by       UUID             NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    max_votes_per_user INTEGER        NOT NULL DEFAULT 1,
    is_public_results BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_election_times CHECK (end_time > start_time),
    CONSTRAINT chk_max_votes CHECK (max_votes_per_user >= 1)
);

CREATE INDEX IF NOT EXISTS idx_elections_status     ON elections(status);
CREATE INDEX IF NOT EXISTS idx_elections_created_by ON elections(created_by);
CREATE INDEX IF NOT EXISTS idx_elections_times      ON elections(start_time, end_time);

CREATE TRIGGER trg_elections_updated_at
    BEFORE UPDATE ON elections
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at();

-- Candidates belong to elections
CREATE TABLE IF NOT EXISTS candidates (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID        NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    manifesto   TEXT,
    photo_url   VARCHAR(500),
    department  VARCHAR(100),
    position    VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_election_id ON candidates(election_id);

COMMENT ON TABLE elections IS 'Academic council elections with time-based lifecycle management';
COMMENT ON COLUMN elections.status IS 'Managed by a scheduled job or trigger based on start/end time';
COMMENT ON COLUMN elections.max_votes_per_user IS 'For multi-choice elections; typically 1';

-- Function to auto-update election status based on time
CREATE OR REPLACE FUNCTION fn_compute_election_status(
    p_start_time TIMESTAMPTZ,
    p_end_time   TIMESTAMPTZ,
    p_current_status election_status
) RETURNS election_status AS $$
BEGIN
    IF p_current_status IN ('cancelled', 'draft') THEN
        RETURN p_current_status;
    ELSIF NOW() < p_start_time THEN
        RETURN 'upcoming';
    ELSIF NOW() BETWEEN p_start_time AND p_end_time THEN
        RETURN 'active';
    ELSE
        RETURN 'completed';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Migration: 003_create_votes
-- Immutable votes table â€” NO UPDATE or DELETE permissions granted

CREATE TABLE IF NOT EXISTS votes (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id  UUID        NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
    voter_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
    candidate_id UUID        NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
    voted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- SHA-256 of (voter_id || election_id || candidate_id || voted_at) for tamper detection
    vote_hash    VARCHAR(64) UNIQUE NOT NULL,
    -- Client IP stored for audit purposes (hashed for privacy)
    ip_hash      VARCHAR(64),
    CONSTRAINT uq_voter_election UNIQUE (voter_id, election_id)
);

-- Indexes for fast result aggregation
CREATE INDEX IF NOT EXISTS idx_votes_election_id  ON votes(election_id);
CREATE INDEX IF NOT EXISTS idx_votes_candidate_id ON votes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_votes_voted_at     ON votes(voted_at);

-- CRITICAL: Revoke mutating privileges on the votes table
-- In production, run these as superuser after app role is created:
-- REVOKE UPDATE, DELETE, TRUNCATE ON TABLE votes FROM voting_app_user;

-- View for live results aggregation (fast read)
CREATE OR REPLACE VIEW v_election_results AS
    SELECT
        e.id         AS election_id,
        e.title      AS election_title,
        c.id         AS candidate_id,
        c.name       AS candidate_name,
        c.department AS candidate_department,
        COUNT(v.id)  AS vote_count,
        ROUND(
            COUNT(v.id) * 100.0 /
            NULLIF(SUM(COUNT(v.id)) OVER (PARTITION BY e.id), 0),
        2) AS vote_percentage
    FROM elections e
    JOIN candidates c ON c.election_id = e.id
    LEFT JOIN votes v ON v.candidate_id = c.id
    GROUP BY e.id, e.title, c.id, c.name, c.department;

-- Summary view: total participation per election
CREATE OR REPLACE VIEW v_election_participation AS
    SELECT
        election_id,
        COUNT(DISTINCT voter_id)   AS total_votes_cast,
        MIN(voted_at)              AS first_vote_at,
        MAX(voted_at)              AS last_vote_at
    FROM votes
    GROUP BY election_id;

COMMENT ON TABLE votes IS 'Append-only vote records. No UPDATE/DELETE allowed by application role.';
COMMENT ON COLUMN votes.vote_hash IS 'Tamper-evident hash: SHA-256(voter_id||election_id||candidate_id||voted_at)';


-- Migration: 004_create_audit_log
-- Immutable audit log â€” append-only, tamper-evident transparency layer

DO $$ BEGIN 
    CREATE TYPE audit_action AS ENUM ('user_registered', 'user_login', 'user_logout', 'user_login_failed', 'election_created', 'election_updated', 'election_cancelled', 'candidate_added', 'vote_cast', 'vote_attempt_duplicate', 'results_viewed', 'admin_action'); 
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
COMMENT ON COLUMN audit_log.row_hash IS 'SHA-256 of (prev_row_hash || action || actor_id || resource_id || logged_at) â€” forms a hash chain';
COMMENT ON COLUMN audit_log.id IS 'BIGSERIAL (sequential) allows ordering verification without timestamps alone';


-- Migration: 005_create_roles_and_permissions
-- Create application DB role with least-privilege access

-- Create application user role (run as superuser)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'voting_app') THEN
        CREATE ROLE voting_app LOGIN PASSWORD 'change_in_production';
    END IF;
END
$$;

-- Grant minimal required permissions
GRANT CONNECT ON DATABASE postgres TO voting_app;
GRANT USAGE ON SCHEMA public TO voting_app;

-- Users table
GRANT SELECT, INSERT, UPDATE ON TABLE users TO voting_app;
GRANT SELECT, INSERT, UPDATE ON TABLE refresh_tokens TO voting_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO voting_app;

-- Elections and candidates
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE elections  TO voting_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE candidates TO voting_app;

-- Votes: INSERT and SELECT ONLY â€” no UPDATE or DELETE
GRANT SELECT, INSERT ON TABLE votes TO voting_app;

-- Audit log: INSERT and SELECT ONLY
GRANT SELECT, INSERT ON TABLE audit_log TO voting_app;

-- Views
GRANT SELECT ON v_election_results      TO voting_app;
GRANT SELECT ON v_election_participation TO voting_app;
GRANT SELECT ON v_audit_trail           TO voting_app;

-- Enable Row Level Security on votes (additional protection layer)
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Policy: voters can only see their own votes (for privacy)
DROP POLICY IF EXISTS votes_own_policy ON votes; CREATE POLICY votes_own_policy ON votes
    FOR SELECT
    USING (voter_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Admins bypass RLS (must be granted explicitly)
-- ALTER TABLE votes FORCE ROW LEVEL SECURITY;

COMMENT ON ROLE voting_app IS 'Least-privilege application role. Cannot UPDATE or DELETE votes or audit_log.';


