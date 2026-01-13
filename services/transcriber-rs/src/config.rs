use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    // Server
    pub host: String,
    pub port: u16,

    // MinIO/S3
    pub minio_endpoint: String,
    pub minio_access_key: String,
    pub minio_secret_key: String,
    pub minio_bucket: String,
    pub minio_use_ssl: bool,

    // Redis
    pub redis_url: String,

    // Model
    pub model_path: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8000),

            minio_endpoint: env::var("MINIO_ENDPOINT")
                .unwrap_or_else(|_| "minio:9000".to_string()),
            minio_access_key: env::var("MINIO_ACCESS_KEY")
                .unwrap_or_else(|_| "minioadmin".to_string()),
            minio_secret_key: env::var("MINIO_SECRET_KEY")
                .unwrap_or_else(|_| "minioadmin123".to_string()),
            minio_bucket: env::var("MINIO_BUCKET")
                .unwrap_or_else(|_| "recordings".to_string()),
            minio_use_ssl: env::var("MINIO_USE_SSL")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false),

            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://redis:6379".to_string()),

            model_path: env::var("MODEL_PATH")
                .unwrap_or_else(|_| "./models/parakeet-v3".to_string()),
        }
    }
}
