use anyhow::{Context, Result};
use s3::creds::Credentials;
use s3::{Bucket, Region};
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tracing::info;

use crate::config::Config;

pub struct Storage {
    bucket: Box<Bucket>,
}

impl Storage {
    pub fn new(config: &Config) -> Result<Self> {
        let region = Region::Custom {
            region: "us-east-1".to_string(),
            endpoint: format!(
                "{}://{}",
                if config.minio_use_ssl { "https" } else { "http" },
                config.minio_endpoint
            ),
        };

        let credentials = Credentials::new(
            Some(&config.minio_access_key),
            Some(&config.minio_secret_key),
            None,
            None,
            None,
        )?;

        let bucket = Bucket::new(&config.minio_bucket, region, credentials)?
            .with_path_style();

        Ok(Self { bucket })
    }

    pub async fn download_file(&self, object_key: &str, local_path: &Path) -> Result<()> {
        info!("Downloading {} to {:?}", object_key, local_path);

        // Get object from S3/MinIO
        let response = self
            .bucket
            .get_object(object_key)
            .await
            .context("Failed to get object from MinIO")?;

        // Write to local file
        let mut file = File::create(local_path)
            .await
            .context("Failed to create local file")?;

        file.write_all(response.bytes())
            .await
            .context("Failed to write file")?;

        file.flush().await?;

        info!("Downloaded {} bytes", response.bytes().len());
        Ok(())
    }

    pub fn normalize_object_key<'a>(&self, file_url: &'a str, bucket_name: &str) -> &'a str {
        // Handle various URL formats:
        // - "recordings/meeting-123/user-456.ogg"
        // - "meeting-123/user-456.ogg"
        // - Full URL with bucket prefix
        file_url
            .strip_prefix(&format!("{}/", bucket_name))
            .unwrap_or(file_url)
    }
}
