use axum::{
    routing::{delete, get},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use std::{sync::Arc, time::Duration};
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
                .unwrap_or_else(|_| "election_service=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let jwt_secret   = std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let port         = std::env::var("PORT").unwrap_or_else(|_| "3002".into());

    let db_pool = PgPoolOptions::new()
        .max_connections(15)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&database_url)
        .await?;

    let state = Arc::new(AppState { db: db_pool, jwt_secret });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/ready",  get(handlers::health::readiness_check))
        .merge(
            election_routes().route_layer(axum::middleware::from_fn_with_state(
                state.clone(),
                mw::require_auth,
            )),
        )
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::new(Duration::from_secs(30)));

    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Election service listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn election_routes() -> Router<Arc<AppState>> {
    Router::new()
        // Election CRUD - support both trailing and non-trailing slashes
        .route("/api/elections",             get(handlers::election::list_elections).post(handlers::election::create_election))
        .route("/api/elections/",            get(handlers::election::list_elections).post(handlers::election::create_election))
        .route("/api/elections/:id",         get(handlers::election::get_election).put(handlers::election::update_election).delete(handlers::election::delete_election))
        // Candidates management
        .route("/api/elections/:id/candidates",      get(handlers::election::list_candidates).post(handlers::election::add_candidate))
        .route("/api/elections/:id/candidates/:cid", delete(handlers::election::remove_candidate))
        // Results
        .route("/api/elections/:id/results",         get(handlers::election::get_results))
        .route("/api/elections/:id/participation",   get(handlers::election::get_participation))
}
