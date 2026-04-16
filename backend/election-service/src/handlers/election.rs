use axum::{
    extract::{Path, Query, State},
    Extension, Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::{
    db::AppState,
    errors::AppError,
    models::election::{
        AddCandidateRequest, Candidate, CreateElectionRequest, Election,
        ElectionResult, UpdateElectionRequest, Claims,
    },
};

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
    pub limit:  Option<i64>,
    pub offset: Option<i64>,
}

/// GET /api/elections — list all elections (filtered by status)
pub async fn list_elections(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let limit  = q.limit.unwrap_or(20).min(100);
    let offset = q.offset.unwrap_or(0);

    let elections = if let Some(status) = &q.status {
        sqlx::query_as::<_, Election>(
            "SELECT * FROM elections WHERE status::text = $1 ORDER BY start_time DESC LIMIT $2 OFFSET $3"
        )
        .bind(status)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, Election>(
            "SELECT * FROM elections ORDER BY start_time DESC LIMIT $1 OFFSET $2"
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    };

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM elections")
        .fetch_one(&state.db)
        .await?;

    Ok(Json(serde_json::json!({
        "data":   elections,
        "total":  total,
        "limit":  limit,
        "offset": offset
    })))
}

/// GET /api/elections/:id
pub async fn get_election(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Election>, AppError> {
    let election = sqlx::query_as::<_, Election>(
        "SELECT * FROM elections WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound("Election not found".into()))?;

    Ok(Json(election))
}

/// POST /api/elections — admin only
pub async fn create_election(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateElectionRequest>,
) -> Result<Json<Election>, AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Only admins can create elections".into()));
    }
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    if req.end_time <= req.start_time {
        return Err(AppError::Validation("end_time must be after start_time".into()));
    }

    let creator_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::TokenInvalid)?;

    let election = sqlx::query_as::<_, Election>(
        r#"
        INSERT INTO elections (title, description, start_time, end_time, created_by, max_votes_per_user, is_public_results)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        "#,
    )
    .bind(&req.title)
    .bind(&req.description)
    .bind(req.start_time)
    .bind(req.end_time)
    .bind(creator_id)
    .bind(req.max_votes_per_user.unwrap_or(1))
    .bind(req.is_public_results.unwrap_or(true))
    .fetch_one(&state.db)
    .await?;

    tracing::info!(election_id = %election.id, creator = %creator_id, "Election created");

    Ok(Json(election))
}

/// PUT /api/elections/:id — admin only
pub async fn update_election(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateElectionRequest>,
) -> Result<Json<Election>, AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Only admins can update elections".into()));
    }

    // Fetch current to ensure it exists
    let current = sqlx::query_as::<_, Election>("SELECT * FROM elections WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound("Election not found".into()))?;

    // Don't allow updating active/completed elections' time fields
    if matches!(current.status, crate::models::election::ElectionStatus::Active | crate::models::election::ElectionStatus::Completed) {
        if req.start_time.is_some() || req.end_time.is_some() {
            return Err(AppError::Validation(
                "Cannot change times of active or completed elections".into()
            ));
        }
    }

    let updated = sqlx::query_as::<_, Election>(
        r#"
        UPDATE elections SET
            title       = COALESCE($1, title),
            description = COALESCE($2, description),
            start_time  = COALESCE($3, start_time),
            end_time    = COALESCE($4, end_time)
        WHERE id = $5
        RETURNING *
        "#,
    )
    .bind(&req.title)
    .bind(&req.description)
    .bind(req.start_time)
    .bind(req.end_time)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(updated))
}

/// DELETE /api/elections/:id — admin, only draft elections
pub async fn delete_election(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Only admins can delete elections".into()));
    }

    let election = sqlx::query_as::<_, Election>("SELECT * FROM elections WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound("Election not found".into()))?;

    if election.status != crate::models::election::ElectionStatus::Draft {
        return Err(AppError::Validation("Only draft elections can be deleted".into()));
    }

    sqlx::query("DELETE FROM elections WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Election deleted" })))
}

/// GET /api/elections/:id/candidates
pub async fn list_candidates(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<Candidate>>, AppError> {
    let candidates = sqlx::query_as::<_, Candidate>(
        "SELECT * FROM candidates WHERE election_id = $1 ORDER BY name"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(candidates))
}

/// POST /api/elections/:id/candidates — admin only
pub async fn add_candidate(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(req): Json<AddCandidateRequest>,
) -> Result<Json<Candidate>, AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Only admins can add candidates".into()));
    }
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    // Ensure election exists and is not active/completed
    let election = sqlx::query_as::<_, Election>("SELECT * FROM elections WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound("Election not found".into()))?;

    if matches!(election.status, crate::models::election::ElectionStatus::Completed | crate::models::election::ElectionStatus::Cancelled) {
        return Err(AppError::Validation("Cannot add candidates to completed/cancelled elections".into()));
    }

    let candidate = sqlx::query_as::<_, Candidate>(
        r#"
        INSERT INTO candidates (election_id, name, manifesto, photo_url, department, position)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(&req.name)
    .bind(&req.manifesto)
    .bind(&req.photo_url)
    .bind(&req.department)
    .bind(&req.position)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(candidate))
}

/// DELETE /api/elections/:id/candidates/:cid — admin only
pub async fn remove_candidate(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path((election_id, candidate_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Only admins can remove candidates".into()));
    }

    sqlx::query("DELETE FROM candidates WHERE id = $1 AND election_id = $2")
        .bind(candidate_id)
        .bind(election_id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Candidate removed" })))
}

/// GET /api/elections/:id/results
pub async fn get_results(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<ElectionResult>>, AppError> {
    let results = sqlx::query_as::<_, ElectionResult>(
        "SELECT * FROM v_election_results WHERE election_id = $1 ORDER BY vote_count DESC"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(results))
}

/// GET /api/elections/:id/participation
pub async fn get_participation(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    #[derive(sqlx::FromRow)]
    struct ParticipationRow {
        total_votes_cast: Option<i64>,
        first_vote_at: Option<chrono::DateTime<chrono::Utc>>,
        last_vote_at: Option<chrono::DateTime<chrono::Utc>>
    }

    let row = sqlx::query_as::<_, ParticipationRow>(
        "SELECT total_votes_cast, first_vote_at, last_vote_at FROM v_election_participation WHERE election_id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    match row {
        Some(r) => Ok(Json(serde_json::json!({
            "election_id":      id,
            "total_votes_cast": r.total_votes_cast,
            "first_vote_at":    r.first_vote_at,
            "last_vote_at":     r.last_vote_at
        }))),
        None => Ok(Json(serde_json::json!({
            "election_id":      id,
            "total_votes_cast": 0
        }))),
    }
}
