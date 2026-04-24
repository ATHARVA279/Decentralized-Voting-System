use axum::{
    body::Body,
    extract::State,
    http::{header, Request},
    middleware::Next,
    response::Response,
};
use shared::{decode_claims, extract_bearer_token};
use std::sync::Arc;

use crate::{db::AppState, errors::AppError};

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

    let token = extract_bearer_token(auth_header)
        .ok_or_else(|| AppError::Unauthorized("Authorization must be Bearer token".into()))?;

    let claims = decode_claims(token, &state.jwt_secret)
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AppError::TokenExpired,
        _ => AppError::TokenInvalid,
    })?;

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
