use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

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
        let (status, message) = match &self {
            AppError::NotFound(_)    => (StatusCode::NOT_FOUND,              self.to_string()),
            AppError::Forbidden(_)   => (StatusCode::FORBIDDEN,              self.to_string()),
            AppError::Unauthorized(_)=> (StatusCode::UNAUTHORIZED,           self.to_string()),
            AppError::Validation(_)  => (StatusCode::UNPROCESSABLE_ENTITY,   self.to_string()),
            AppError::TokenInvalid   => (StatusCode::UNAUTHORIZED,           "Token invalid".into()),
            AppError::TokenExpired   => (StatusCode::UNAUTHORIZED,           "Token expired".into()),
            AppError::Database(e)    => {
                tracing::error!("DB error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".into())
            }
            AppError::Internal(e)    => {
                tracing::error!("Internal: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal error".into())
            }
        };
        (status, Json(json!({ "error": message, "status": status.as_u16() }))).into_response()
    }
}
