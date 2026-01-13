use anyhow::{Context, Result};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStatus {
    pub status: String,
    pub current: Option<u32>,
    pub total: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionStatus {
    pub status: String,
    pub text: Option<String>,
    pub duration: Option<f64>,
    pub error: Option<String>,
}

pub struct Queue {
    client: redis::Client,
}

impl Queue {
    pub fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url).context("Failed to connect to Redis")?;
        Ok(Self { client })
    }

    pub async fn set_job_status(&self, job_id: &str, status: &JobStatus) -> Result<()> {
        let mut conn = self
            .client
            .get_multiplexed_async_connection()
            .await
            .context("Failed to get Redis connection")?;

        let key = format!("transcribe:job:{}", job_id);

        conn.hset::<_, _, _, ()>(&key, "status", &status.status)
            .await?;

        if let Some(current) = status.current {
            conn.hset::<_, _, _, ()>(&key, "current", current.to_string())
                .await?;
        }

        if let Some(total) = status.total {
            conn.hset::<_, _, _, ()>(&key, "total", total.to_string())
                .await?;
        }

        // Set expiration (24 hours)
        conn.expire::<_, ()>(&key, 86400).await?;

        info!("Updated job {} status: {:?}", job_id, status);
        Ok(())
    }

    pub async fn get_job_status(&self, job_id: &str) -> Result<Option<JobStatus>> {
        let mut conn = self
            .client
            .get_multiplexed_async_connection()
            .await
            .context("Failed to get Redis connection")?;

        let key = format!("transcribe:job:{}", job_id);
        let data: std::collections::HashMap<String, String> =
            conn.hgetall(&key).await.context("Failed to get job status")?;

        if data.is_empty() {
            return Ok(None);
        }

        Ok(Some(JobStatus {
            status: data.get("status").cloned().unwrap_or_default(),
            current: data.get("current").and_then(|s| s.parse().ok()),
            total: data.get("total").and_then(|s| s.parse().ok()),
        }))
    }

    pub async fn set_transcription_result(
        &self,
        recording_id: &str,
        result: &TranscriptionStatus,
    ) -> Result<()> {
        let mut conn = self
            .client
            .get_multiplexed_async_connection()
            .await
            .context("Failed to get Redis connection")?;

        let key = format!("transcribe:result:{}", recording_id);

        conn.hset::<_, _, _, ()>(&key, "status", &result.status)
            .await?;

        if let Some(ref text) = result.text {
            conn.hset::<_, _, _, ()>(&key, "text", text).await?;
        }

        if let Some(duration) = result.duration {
            conn.hset::<_, _, _, ()>(&key, "duration", duration.to_string())
                .await?;
        }

        if let Some(ref error) = result.error {
            conn.hset::<_, _, _, ()>(&key, "error", error).await?;
        }

        // Set expiration (7 days)
        conn.expire::<_, ()>(&key, 604800).await?;

        Ok(())
    }
}
