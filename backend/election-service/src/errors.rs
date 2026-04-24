use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

fn map_db_error(e: &sqlx::Error) -> (StatusCode, serde_json::Value) {
    if let sqlx::Error::Database(db_err) = e {
        let code = db_err.code().map(|c| c.to_string());
        let message = db_err.message().to_string();
        let constraint = db_err.constraint().map(|c| c.to_string());
        let table = db_err.table().map(|t| t.to_string());

        // PostgreSQL 0A000: feature_not_supported. We explicitly handle the
        // "cached plan must not change result type" case so callers get a
        // meaningful, retryable response rather than an opaque 500.
        if code.as_deref() == Some("0A000") && message.contains("cached plan must not change result type") {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                json!({
                    "error": "Database cached plan became invalid after schema/type change. Retry the request.",
                    "error_type": "postgres_cached_plan_changed",
                    "db_code": code,
                    "db_message": message,
                    "db_constraint": constraint,
                    "db_table": table,
                }),
            );
        }

        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({
                "error": "Database operation failed",
                "error_type": "database_error",
                "db_code": code,
                "db_message": message,
                "db_constraint": constraint,
                "db_table": table,
            }),
        );
    }

    (
        StatusCode::INTERNAL_SERVER_ERROR,
        json!({
            "error": "Database operation failed",
            "error_type": "database_error",
            "db_message": e.to_string(),
        }),
    )
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Token invalid")]
    TokenInvalid,
    #[error("Token expired")]
    TokenExpired,
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Internal error")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, body) = match &self {
            AppError::NotFound(_)    => (StatusCode::NOT_FOUND, json!({
                "error": self.to_string(),
                "error_type": "not_found",
            })),
            AppError::Forbidden(_)   => (StatusCode::FORBIDDEN, json!({
                "error": self.to_string(),
                "error_type": "forbidden",
            })),
            AppError::Unauthorized(_)=> (StatusCode::UNAUTHORIZED, json!({
                "error": self.to_string(),
                "error_type": "unauthorized",
            })),
            AppError::Validation(_)  => (StatusCode::UNPROCESSABLE_ENTITY, json!({
                "error": self.to_string(),
                "error_type": "validation_error",
            })),
            AppError::TokenInvalid   => (StatusCode::UNAUTHORIZED, json!({
                "error": "Token invalid",
                "error_type": "token_invalid",
            })),
            AppError::TokenExpired   => (StatusCode::UNAUTHORIZED, json!({
                "error": "Token expired",
                "error_type": "token_expired",
            })),
            AppError::Database(e)    => {
                tracing::error!("DB error: {:?}", e);
                map_db_error(e)
            }
            AppError::Internal(e)    => {
                tracing::error!("Internal: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, json!({
                    "error": "Internal error",
                    "error_type": "internal_error",
                }))
            }
        };

        let mut obj = match body {
            serde_json::Value::Object(map) => map,
            _ => serde_json::Map::new(),
        };
        obj.insert("status".into(), json!(status.as_u16()));
        (status, Json(serde_json::Value::Object(obj))).into_response()
    }
}
