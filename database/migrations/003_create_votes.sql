-- Migration: 003_create_votes
-- Immutable votes table — NO UPDATE or DELETE permissions granted

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


