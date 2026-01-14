mod config;
mod handlers;
mod queue;
mod storage;
mod transcriber;

use anyhow::Result;
use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use config::Config;
use handlers::AppState;
use queue::Queue;
use storage::Storage;
use transcriber::Transcriber;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_target(false)
        .init();

    info!("Starting TinkerVoid Transcriber Service (Rust)");

    // Load configuration
    let config = Config::from_env();
    info!("Configuration loaded");

    // Initialize components
    let storage = Storage::new(&config)?;
    info!("Storage client initialized");

    let queue = Queue::new(&config.redis_url)?;
    info!("Redis queue initialized");

    // Initialize transcriber
    let mut transcriber = Transcriber::new();

    // Load model
    let model_path = PathBuf::from(&config.model_path);
    transcriber.load_model(&model_path).await?;

    // Create shared state
    let state = Arc::new(AppState {
        transcriber: RwLock::new(transcriber),
        storage,
        queue,
        bucket_name: config.minio_bucket.clone(),
    });

    // Build router
    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/transcribe", post(handlers::transcribe))
        .route("/transcribe/batch", post(handlers::transcribe_batch))
        .route("/job/{job_id}", get(handlers::get_job_status))
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Server shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install CTRL+C signal handler");
    info!("Received shutdown signal");
}
