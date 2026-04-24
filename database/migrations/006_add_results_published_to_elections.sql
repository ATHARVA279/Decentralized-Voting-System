-- Migration: 006_add_results_published_to_elections
-- Adds explicit publication control for non-live election results

ALTER TABLE elections
ADD COLUMN IF NOT EXISTS results_published BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN elections.results_published IS 'For non-live results, controls whether final results are visible to non-admin users after completion';
