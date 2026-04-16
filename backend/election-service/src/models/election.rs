use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "election_status", rename_all = "lowercase")]
pub enum ElectionStatus {
    Draft,
    Upcoming,
    Active,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Election {
    pub id:               Uuid,
    pub title:            String,
    pub description:      Option<String>,
    pub start_time:       DateTime<Utc>,
    pub end_time:         DateTime<Utc>,
    pub status:           ElectionStatus,
    pub created_by:       Uuid,
    pub max_votes_per_user: i32,
    pub is_public_results: bool,
    pub created_at:       DateTime<Utc>,
    pub updated_at:       DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Candidate {
    pub id:          Uuid,
    pub election_id: Uuid,
    pub name:        String,
    pub manifesto:   Option<String>,
    pub photo_url:   Option<String>,
    pub department:  Option<String>,
    pub position:    Option<String>,
    pub created_at:  DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ElectionResult {
    pub election_id:         Uuid,
    pub election_title:      String,
    pub candidate_id:        Uuid,
    pub candidate_name:      String,
    pub candidate_department: Option<String>,
    pub vote_count:          i64,
    pub vote_percentage:     Option<f64>,
}

// ── Request types ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Validate)]
pub struct CreateElectionRequest {
    #[validate(length(min = 3, max = 255))]
    pub title:             String,
    pub description:       Option<String>,
    pub start_time:        DateTime<Utc>,
    pub end_time:          DateTime<Utc>,
    pub max_votes_per_user: Option<i32>,
    pub is_public_results: Option<bool>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateElectionRequest {
    #[validate(length(min = 3, max = 255))]
    pub title:       Option<String>,
    pub description: Option<String>,
    pub start_time:  Option<DateTime<Utc>>,
    pub end_time:    Option<DateTime<Utc>>,
    pub status:      Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct AddCandidateRequest {
    #[validate(length(min = 2, max = 255))]
    pub name:       String,
    pub manifesto:  Option<String>,
    pub photo_url:  Option<String>,
    pub department: Option<String>,
    pub position:   Option<String>,
}

// Claims type mirrored from auth-service (shared in a workspace in production)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub:   String,
    pub email: String,
    pub role:  String,
    pub iat:   i64,
    pub exp:   i64,
    pub jti:   String,
}
