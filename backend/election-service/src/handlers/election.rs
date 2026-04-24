use axum::{
    extract::{Path, Query, State},
    Extension, Json,
};
use chrono::Utc;
use serde::Deserialize;
use shared::Claims;
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::{
    db::AppState,
    errors::AppError,
    models::election::{
        AddCandidateRequest, Candidate, CreateElectionRequest, Election,
        ElectionResult, UpdateElectionRequest,
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
    refresh_election_statuses(&state.db).await?;

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
    refresh_election_statuses(&state.db).await?;

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
    let status = status_for_times(req.start_time, req.end_time);

    let election = sqlx::query_as::<_, Election>(
        r#"
        INSERT INTO elections (title, description, start_time, end_time, status, created_by, is_public_results)
        VALUES ($1, $2, $3, $4, $5::election_status, $6, $7)
        RETURNING *
        "#,
    )
    .bind(&req.title)
    .bind(&req.description)
    .bind(req.start_time)
    .bind(req.end_time)
    .bind(status)
    .bind(creator_id)
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
            end_time    = COALESCE($4, end_time),
            status      = CASE
                WHEN COALESCE($4, end_time) <= NOW() THEN 'completed'
                WHEN COALESCE($3, start_time) <= NOW() THEN 'active'
                ELSE 'upcoming'
            END::election_status
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

/// DELETE /api/elections/:id — admin, only elections that have not started
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

    if election.status != crate::models::election::ElectionStatus::Upcoming {
        return Err(AppError::Validation("Only upcoming elections can be deleted".into()));
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
        r#"
        SELECT c.id, c.election_id, c.user_id, u.full_name as name, u.student_id, u.department, c.manifesto, c.position, c.created_at
        FROM candidates c
        JOIN users u ON c.user_id = u.id
        WHERE c.election_id = $1
        ORDER BY u.full_name
        "#
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

    // Verify user exists and get details
    #[derive(sqlx::FromRow)]
    struct UserData {
        full_name: String,
        student_id: Option<String>,
        department: Option<String>,
    }

    let user = sqlx::query_as::<_, UserData>("SELECT full_name, student_id, department FROM users WHERE id = $1")
        .bind(req.user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound("User not found".into()))?;

    // Check if already a candidate
    let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM candidates WHERE election_id = $1 AND user_id = $2")
        .bind(id)
        .bind(req.user_id)
        .fetch_one(&state.db)
        .await?;

    if existing > 0 {
        return Err(AppError::Validation("User is already a candidate for this election".into()));
    }

    let candidate_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO candidates (id, election_id, user_id, manifesto, position)
        VALUES ($1, $2, $3, $4, $5)
        "#
    )
    .bind(candidate_id)
    .bind(id)
    .bind(req.user_id)
    .bind(&req.manifesto)
    .bind(&req.position)
    .execute(&state.db)
    .await?;

    let candidate = Candidate {
        id: candidate_id,
        election_id: id,
        user_id: req.user_id,
        name: user.full_name,
        student_id: user.student_id,
        department: user.department,
        manifesto: req.manifesto,
        position: req.position,
        created_at: Utc::now(),
    };

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

fn status_for_times(
    start_time: chrono::DateTime<chrono::Utc>,
    end_time: chrono::DateTime<chrono::Utc>,
) -> &'static str {
    let now = Utc::now();

    if end_time <= now {
        "completed"
    } else if start_time <= now {
        "active"
    } else {
        "upcoming"
    }
}

async fn refresh_election_statuses(db: &sqlx::PgPool) -> Result<(), AppError> {
    sqlx::query(
        r#"
        UPDATE elections
        SET status = CASE
                WHEN end_time <= NOW() THEN 'completed'
                WHEN start_time <= NOW() THEN 'active'
                ELSE 'upcoming'
            END::election_status
        WHERE status != 'cancelled'
          AND status IS DISTINCT FROM CASE
                WHEN end_time <= NOW() THEN 'completed'
                WHEN start_time <= NOW() THEN 'active'
                ELSE 'upcoming'
            END::election_status
        "#
    )
    .execute(db)
    .await?;

    Ok(())
}
