use axum::{extract::State, Json};
use std::sync::Arc;
use crate::db::AppState;

/// GET /health — Kubernetes liveness probe
pub async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status":  "healthy",
        "service": "auth-service",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

/// GET /ready — Kubernetes readiness probe (checks DB + Redis)
pub async fn readiness_check(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, axum::http::StatusCode> {
    // Check DB
    sqlx::query("SELECT 1")
        .execute(&state.db)
        .await
        .map_err(|_| axum::http::StatusCode::SERVICE_UNAVAILABLE)?;

    // Check Redis
    let mut con = state.redis.clone();
    redis::cmd("PING")
        .query_async::<_, String>(&mut con)
        .await
        .map_err(|_| axum::http::StatusCode::SERVICE_UNAVAILABLE)?;

    Ok(Json(serde_json::json!({
        "status":    "ready",
        "db":        "ok",
        "redis":     "ok"
    })))
}
