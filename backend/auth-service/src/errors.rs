use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("User already exists")]
    UserAlreadyExists,

    #[error("User not found")]
    UserNotFound,

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Token expired")]
    TokenExpired,

    #[error("Token invalid")]
    TokenInvalid,

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::InvalidCredentials  => (StatusCode::UNAUTHORIZED,        self.to_string()),
            AppError::UserAlreadyExists   => (StatusCode::CONFLICT,            self.to_string()),
            AppError::UserNotFound        => (StatusCode::NOT_FOUND,           self.to_string()),
            AppError::Unauthorized(_)     => (StatusCode::UNAUTHORIZED,        self.to_string()),
            AppError::Forbidden(_)        => (StatusCode::FORBIDDEN,           self.to_string()),
            AppError::Validation(_)       => (StatusCode::UNPROCESSABLE_ENTITY, self.to_string()),
            AppError::TokenExpired        => (StatusCode::UNAUTHORIZED,        self.to_string()),
            AppError::TokenInvalid        => (StatusCode::UNAUTHORIZED,        self.to_string()),
            AppError::Database(e)         => {
                tracing::error!("DB error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
            }
            AppError::Redis(e)            => {
                tracing::error!("Redis error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Cache error".to_string())
            }
            AppError::Internal(e)         => {
                tracing::error!("Internal error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = Json(json!({
            "error": message,
            "status": status.as_u16()
        }));

        (status, body).into_response()
    }
}
