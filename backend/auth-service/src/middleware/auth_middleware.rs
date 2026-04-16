use axum::{
    body::Body,
    extract::State,
    http::{header, Request, StatusCode},
    middleware::Next,
    response::Response,
    Extension,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use redis::AsyncCommands;
use std::sync::Arc;

use crate::{db::AppState, errors::AppError, models::user::Claims};

/// JWT auth middleware — validates Bearer token and injects Claims into request extensions
pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    // Extract token from Authorization: Bearer <token>
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

    if !auth_header.starts_with("Bearer ") {
        return Err(AppError::Unauthorized("Authorization must be Bearer token".into()));
    }

    let token = &auth_header["Bearer ".len()..];

    // Decode and validate JWT
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AppError::TokenExpired,
        _ => AppError::TokenInvalid,
    })?;

    let claims = token_data.claims;

    // Check if token JTI is blacklisted in Redis (logout handling)
    let blacklist_key = format!("blacklist:jti:{}", claims.jti);
    let mut con = state.redis.clone();
    let is_blacklisted: bool = redis::cmd("EXISTS")
        .arg(&blacklist_key)
        .query_async::<_, i64>(&mut con)
        .await
        .map(|v| v > 0)
        .unwrap_or(false);

    if is_blacklisted {
        return Err(AppError::Unauthorized("Token has been revoked".into()));
    }

    // Inject claims into request extensions for downstream handlers
    req.extensions_mut().insert(claims);

    Ok(next.run(req).await)
}

/// Admin-only guard — must be used AFTER require_auth
pub async fn require_admin(
    req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| AppError::Unauthorized("No auth context".into()))?;

    if claims.role != "admin" {
        return Err(AppError::Forbidden(
            "This action requires admin privileges".into(),
        ));
    }

    Ok(next.run(req).await)
}
