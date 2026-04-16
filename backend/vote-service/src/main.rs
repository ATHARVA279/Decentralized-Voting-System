use axum::{
    extract::ws::{WebSocket, WebSocketUpgrade},
    routing::{get, post},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use std::{sync::Arc, time::Duration};
use tokio::sync::broadcast;
use tower_http::{cors::{Any, CorsLayer}, timeout::TimeoutLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod db;
mod errors;
mod handlers;
mod middleware;
use middleware as mw;
mod models;

pub use db::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "vote_service=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let redis_url    = std::env::var("REDIS_URL").expect("REDIS_URL must be set");
    let jwt_secret   = std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let port         = std::env::var("PORT").unwrap_or_else(|_| "3003".into());

    let db_pool = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(5)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&database_url)
        .await?;

    let redis_client  = redis::Client::open(redis_url)?;
    let redis_manager = redis::aio::ConnectionManager::new(redis_client).await?;

    // Broadcast channel for live vote count updates (WebSocket)
    // capacity 1024 messages
    let (tx, _rx) = broadcast::channel::<String>(1024);
    let vote_broadcast = Arc::new(tx);

    let state = Arc::new(AppState {
        db: db_pool,
        redis: redis_manager,
        jwt_secret,
        vote_broadcast,
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/ready",  get(handlers::health::readiness_check))
        .nest(
            "/api/votes",
            vote_routes().route_layer(axum::middleware::from_fn_with_state(
                state.clone(),
                mw::require_auth,
            )),
        )
        // WebSocket route (auth checked inside handler via query param token)
        .route("/api/votes/live/:election_id", get(handlers::vote::live_results_ws))
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::new(Duration::from_secs(30)));

    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Vote service listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn vote_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/cast",                get(handlers::vote::cast_vote).post(handlers::vote::cast_vote))
        .route("/cast",                post(handlers::vote::cast_vote))
        .route("/status/:election_id", get(handlers::vote::vote_status))
        .route("/audit/:election_id",  get(handlers::vote::audit_trail))
}
