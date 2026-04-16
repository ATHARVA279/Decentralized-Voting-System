// Shared JWT middleware — duplicated per service.
// In production, extract to a shared Cargo workspace crate: crates/shared-auth/
use axum::{body::Body, extract::State, http::{header, Request}, middleware::Next, response::Response};
use jsonwebtoken::{decode, DecodingKey, Validation};
use std::sync::Arc;
use crate::{db::AppState, errors::AppError, models::election::Claims};

pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = req.headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

    if !auth_header.starts_with("Bearer ") {
        return Err(AppError::Unauthorized("Must use Bearer token".into()));
    }

    let token = &auth_header["Bearer ".len()..];

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AppError::TokenExpired,
        _ => AppError::TokenInvalid,
    })?;

    req.extensions_mut().insert(token_data.claims);
    Ok(next.run(req).await)
}
