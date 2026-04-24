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

-- Grant minimal required permissions on whichever database ran this migration.
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO voting_app', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO voting_app;

-- Users table
GRANT SELECT, INSERT, UPDATE ON TABLE users TO voting_app;
GRANT SELECT, INSERT, UPDATE ON TABLE refresh_tokens TO voting_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO voting_app;

-- Elections and candidates
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE elections  TO voting_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE candidates TO voting_app;

-- Votes: INSERT and SELECT ONLY — no UPDATE or DELETE
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

