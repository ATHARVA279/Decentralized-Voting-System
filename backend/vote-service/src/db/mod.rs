use redis::aio::ConnectionManager;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::broadcast;

pub struct AppState {
    pub db:             PgPool,
    pub redis:          ConnectionManager,
    pub jwt_secret:     String,
    /// Broadcast channel for real-time vote count push to WebSocket clients
    pub vote_broadcast: Arc<broadcast::Sender<String>>,
}
