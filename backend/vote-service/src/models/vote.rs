use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Vote {
    pub id:          Uuid,
    pub election_id: Uuid,
    pub voter_id:    Uuid,
    pub candidate_id:Uuid,
    pub voted_at:    DateTime<Utc>,
    pub vote_hash:   String,
}

#[derive(Debug, Deserialize)]
pub struct CastVoteRequest {
    pub election_id:  Uuid,
    pub candidate_id: Uuid,
}
