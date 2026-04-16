use axum::{http::StatusCode, extract::State, Json};
use std::sync::Arc;
use crate::db::AppState;

pub async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status":  "healthy",
        "service": "vote-service",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

pub async fn readiness_check(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    sqlx::query("SELECT 1")
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    let mut con = state.redis.clone();
    redis::cmd("PING")
        .query_async::<_, String>(&mut con)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    Ok(Json(serde_json::json!({ "status": "ready", "db": "ok", "redis": "ok" })))
}
