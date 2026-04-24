use redis::aio::ConnectionManager;
use sqlx::PgPool;

/// Shared application state injected into every handler via Axum's State extractor
pub struct AppState {
    pub db: PgPool,
    pub redis: ConnectionManager,
    pub jwt_secret: String,
}
