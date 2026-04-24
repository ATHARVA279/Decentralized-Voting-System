use axum::{body::Body, extract::State, http::{header, Request}, middleware::Next, response::Response};
use shared::{decode_claims, extract_bearer_token};
use std::sync::Arc;
use crate::{db::AppState, errors::AppError};

pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = req.headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

    let token = extract_bearer_token(auth_header)
        .ok_or_else(|| AppError::Unauthorized("Must use Bearer token".into()))?;
    let claims = decode_claims(token, &state.jwt_secret)
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AppError::TokenExpired,
        _ => AppError::TokenInvalid,
    })?;

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

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}
