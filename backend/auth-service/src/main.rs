use axum::{
    routing::{get, post},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use std::{sync::Arc, time::Duration};
use tower_http::{
    cors::{Any, CorsLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
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
    // Load .env in development
    dotenvy::dotenv().ok();

    // Initialize structured JSON logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "auth_service=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");
    let redis_url = std::env::var("REDIS_URL")
        .expect("REDIS_URL must be set");
    let jwt_secret = std::env::var("JWT_SECRET")
        .expect("JWT_SECRET must be set");
    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".into());

    // PostgreSQL connection pool — retry loop handles transient DNS failures at startup
    let db_pool = {
        let mut last_err = None;
        let mut pool = None;
        for attempt in 1..=10u32 {
            match PgPoolOptions::new()
                .max_connections(20)
                .min_connections(2)
                .acquire_timeout(Duration::from_secs(10))
                .connect(&database_url)
                .await
            {
                Ok(p) => {
                    pool = Some(p);
                    break;
                }
                Err(e) => {
                    tracing::warn!(attempt, error = %e, "DB connect failed, retrying in 3s…");
                    last_err = Some(e);
                    tokio::time::sleep(Duration::from_secs(3)).await;
                }
            }
        }
        pool.ok_or_else(|| {
            anyhow::anyhow!("Failed to connect to DB after 10 attempts: {:?}", last_err)
        })?
    };

    tracing::info!("Connected to PostgreSQL");

    // Redis connection manager (auto-reconnects)
    let redis_client = redis::Client::open(redis_url)?;
    let redis_manager = redis::aio::ConnectionManager::new(redis_client).await?;

    let state = Arc::new(AppState {
        db: db_pool,
        redis: redis_manager,
        jwt_secret,
    });

    // CORS — restrict in production to your actual domain
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // Health check — used by K8s liveness probe
        .route("/health", get(handlers::health::health_check))
        .route("/ready",  get(handlers::health::readiness_check))
        // Public auth routes
        .nest("/api/auth", public_routes())
        // Protected routes (require valid JWT)
        .nest(
            "/api/auth",
            protected_routes().route_layer(axum::middleware::from_fn_with_state(
                state.clone(),
                mw::require_auth,
            )),
        )
        // User operations
        .nest(
            "/api/users",
            Router::new()
                .route("/search", get(handlers::auth::search_users))
                .route_layer(axum::middleware::from_fn_with_state(
                    state.clone(),
                    mw::require_auth,
                )),
        )
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::new(Duration::from_secs(30)));

    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Auth service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn public_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/register", post(handlers::auth::register))
        .route("/login",    post(handlers::auth::login))
        .route("/refresh",  post(handlers::auth::refresh_token))
}

fn protected_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/me",     get(handlers::auth::get_me))
        .route("/logout", post(handlers::auth::logout))
}
