use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::env;
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
            AppError::Validation(_)       => (StatusCode::UNPROCESSABLE_ENTITY, self.to_string()),
            AppError::TokenExpired        => (StatusCode::UNAUTHORIZED,        self.to_string()),
            AppError::TokenInvalid        => (StatusCode::UNAUTHORIZED,        self.to_string()),
            AppError::Database(e)         => {
                tracing::error!("DB error: {:?}", e);

                if let sqlx::Error::Database(db_err) = e {
                    let code = db_err.code().map(|c| c.to_string());
                    let constraint = db_err.constraint();
                    let db_message = db_err.message().to_string();
                    let expose_details = env::var("APP_ENV").unwrap_or_else(|_| "development".into()) != "production";

                    match (code.as_deref(), constraint) {
                        (Some("23505"), Some("users_email_key")) => {
                            (StatusCode::CONFLICT, "User already exists".to_string())
                        }
                        (Some("23505"), Some("users_student_id_key")) => {
                            (StatusCode::CONFLICT, "Student ID already exists".to_string())
                        }
                        (Some("23505"), _) => {
                            (StatusCode::CONFLICT, "Duplicate record".to_string())
                        }
                        (Some("42501"), _) => {
                            (StatusCode::FORBIDDEN, "Database permission denied".to_string())
                        }
                        _ if expose_details => {
                            (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_message))
                        }
                        _ => (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string()),
                    }
                } else {
                    (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
                }
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
