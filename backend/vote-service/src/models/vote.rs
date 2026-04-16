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

#[derive(Debug, Serialize, FromRow)]
pub struct AuditEntry {
    pub id:            i64,
    pub action:        String,
    pub actor_name:    Option<String>,
    pub actor_email:   Option<String>,
    pub resource_type: Option<String>,
    pub resource_id:   Option<Uuid>,
    pub metadata:      Option<serde_json::Value>,
    pub ip_address:    Option<std::net::IpAddr>,
    pub logged_at:     DateTime<Utc>,
    pub row_hash:      String,
}

#[derive(Debug, Serialize)]
pub struct LiveVoteCount {
    pub election_id:  Uuid,
    pub candidate_id: Uuid,
    pub vote_count:   i64,
    pub updated_at:   DateTime<Utc>,
}

// JWT Claims (mirrors auth service — share via workspace crate in production)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub:   String,
    pub email: String,
    pub role:  String,
    pub iat:   i64,
    pub exp:   i64,
    pub jti:   String,
}
