-- Migration: 002_create_elections
-- Creates elections and candidates tables

DO c:\Users\sahil\OneDrive\Desktop\Decantralised Voting System\Decentralized-Voting-System BEGIN CREATE TYPE election_status AS ENUM ('draft', 'upcoming', 'active', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END c:\Users\sahil\OneDrive\Desktop\Decantralised Voting System\Decentralized-Voting-System;

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


