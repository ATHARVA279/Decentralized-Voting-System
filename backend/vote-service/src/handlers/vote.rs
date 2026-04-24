use axum::{extract::{Extension, Path, State}, Json};
use chrono::Utc;
use redis::AsyncCommands;
use sha2::{Digest, Sha256};
use shared::Claims;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    db::AppState,
    errors::AppError,
    models::vote::{CastVoteRequest, Vote},
};

/// POST /api/votes/cast — idempotent write with deduplication
pub async fn cast_vote(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CastVoteRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let voter_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::TokenInvalid)?;

    // 1. Redis duplicate-vote guard (fast path — prevents DB roundtrip on duplicate)
    let redis_key = format!("voted:{}:{}", voter_id, req.election_id);
    let mut con   = state.redis.clone();
    let already_voted: bool = con.exists(&redis_key).await.unwrap_or(false);
    if already_voted {
        // Log attempt
        write_audit(
            &state, "vote_attempt_duplicate", voter_id,
            "vote", req.election_id,
            serde_json::json!({ "election_id": req.election_id, "candidate_id": req.candidate_id }),
        ).await?;
        return Err(AppError::DuplicateVote);
    }

    // 2. Verify election is within the voting window
    #[derive(sqlx::FromRow)]
    struct ElectionStatusRow {
        status: Option<String>,
        start_time: chrono::DateTime<chrono::Utc>,
        end_time: chrono::DateTime<chrono::Utc>,
    }

    let election = sqlx::query_as::<_, ElectionStatusRow>(
        "SELECT status::text as status, start_time, end_time FROM elections WHERE id = $1"
    )
    .bind(req.election_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound("Election not found".into()))?;

    let now = Utc::now();

    if election.status.as_deref() == Some("cancelled") {
        return Err(AppError::InvalidOperation("Election is cancelled".into()));
    }

    if now < election.start_time || now > election.end_time {
        return Err(AppError::InvalidOperation(
            format!("Election is outside the voting window (status: {:?})", election.status)
        ));
    }

    // 3. Verify candidate belongs to this election
    let candidate_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM candidates WHERE id = $1 AND election_id = $2)"
    )
    .bind(req.candidate_id)
    .bind(req.election_id)
    .fetch_one(&state.db)
    .await?;

    if !candidate_exists {
        return Err(AppError::NotFound("Candidate not found in this election".into()));
    }

    // 4. Generate tamper-evident vote hash
    let voted_at    = Utc::now();
    let hash_input  = format!("{}{}{}{}",
        voter_id, req.election_id, req.candidate_id, voted_at.timestamp_nanos_opt().unwrap_or_default()
    );
    let vote_hash   = hex::encode(Sha256::digest(hash_input.as_bytes()));

    // 5. Insert vote (DB unique constraint prevents double votes even if Redis fails)
    let vote = sqlx::query_as::<_, Vote>(
        r#"
        INSERT INTO votes (election_id, voter_id, candidate_id, voted_at, vote_hash)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(req.election_id)
    .bind(voter_id)
    .bind(req.candidate_id)
    .bind(voted_at)
    .bind(&vote_hash)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref dbe) = e {
            if dbe.constraint() == Some("uq_voter_election") {
                return AppError::DuplicateVote;
            }
        }
        AppError::Database(e)
    })?;

    // 6. Mark voted in Redis (TTL slightly past election end to handle edge cases)
    let ttl = (election.end_time - voted_at).num_seconds().max(3600);
    con.set_ex::<_, _, ()>(&redis_key, "1", ttl as u64).await.ok();

    // 7. Audit log
    write_audit(
        &state, "vote_cast", voter_id, "vote", req.election_id,
        serde_json::json!({
            "candidate_id": req.candidate_id,
            "vote_hash":    vote_hash
        }),
    ).await?;

    Ok(Json(serde_json::json!({
        "message":   "Vote cast successfully",
        "vote_id":   vote.id,
        "vote_hash": vote.vote_hash
    })))
}

/// GET /api/votes/status/:election_id — has current user voted?
pub async fn vote_status(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(election_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let voter_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::TokenInvalid)?;

    let voted: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM votes WHERE voter_id = $1 AND election_id = $2)"
    )
    .bind(voter_id)
    .bind(election_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "election_id": election_id,
        "has_voted":   voted
    })))
}

/// GET /api/votes/audit/:election_id — admin-only full audit trail
pub async fn audit_trail(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(election_id): Path<Uuid>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin access required".into()));
    }

    #[derive(sqlx::FromRow)]
    struct AuditRow {
        id: i64,
        action: Option<String>,
        actor_id: Option<Uuid>,
        resource_type: Option<String>,
        resource_id: Option<Uuid>,
        metadata: Option<serde_json::Value>,
        logged_at: chrono::DateTime<chrono::Utc>,
        row_hash: Option<String>,
    }

    let rows = sqlx::query_as::<_, AuditRow>(
        r#"
        SELECT id, action::text as action, actor_id, resource_type, resource_id,
               metadata, logged_at, row_hash
        FROM audit_log
        WHERE resource_id = $1
        ORDER BY logged_at ASC
        "#
    )
    .bind(election_id)
    .fetch_all(&state.db)
    .await?;

    let entries: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| serde_json::json!({
            "id":            r.id,
            "action":        r.action,
            "actor_id":      r.actor_id,
            "resource_type": r.resource_type,
            "resource_id":   r.resource_id,
            "metadata":      r.metadata,
            "logged_at":     r.logged_at,
            "row_hash":      r.row_hash
        }))
        .collect();

    Ok(Json(entries))
}

async fn write_audit(
    state:         &AppState,
    action:        &str,
    actor_id:      Uuid,
    resource_type: &str,
    resource_id:   Uuid,
    metadata:      serde_json::Value,
) -> Result<(), AppError> {
    let chain_input = format!("genesis{}{}{}", action, actor_id, Utc::now().timestamp());
    let row_hash = hex::encode(Sha256::digest(chain_input.as_bytes()));

    sqlx::query(
        r#"
        INSERT INTO audit_log (action, actor_id, resource_type, resource_id, metadata, row_hash)
        VALUES ($1::audit_action, $2, $3, $4, $5, $6)
        "#
    )
    .bind(action)
    .bind(actor_id)
    .bind(resource_type)
    .bind(resource_id)
    .bind(metadata)
    .bind(row_hash)
    .execute(&state.db)
    .await?;

    Ok(())
}
