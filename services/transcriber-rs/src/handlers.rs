use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tempfile::NamedTempFile;
use tokio::sync::RwLock;
use tracing::{error, info};
use uuid::Uuid;

use crate::queue::{JobStatus, Queue, TranscriptionStatus};
use crate::storage::Storage;
use crate::transcriber::Transcriber;

pub struct AppState {
    pub transcriber: RwLock<Transcriber>,
    pub storage: Storage,
    pub queue: Queue,
    pub bucket_name: String,
}

// Request/Response types

#[derive(Debug, Deserialize)]
pub struct TranscribeRequest {
    pub file_url: String,
    pub recording_id: String,
    pub callback_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TranscribeResponse {
    pub recording_id: String,
    pub text: String,
    pub segments: Vec<SegmentResponse>,
    pub duration: f64,
}

#[derive(Debug, Serialize)]
pub struct SegmentResponse {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub model_loaded: bool,
}

#[derive(Debug, Serialize)]
pub struct BatchResponse {
    pub job_id: String,
    pub status: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// Handlers

pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let transcriber = state.transcriber.read().await;
    Json(HealthResponse {
        status: "healthy".to_string(),
        model_loaded: transcriber.is_ready(),
    })
}

pub async fn transcribe(
    State(state): State<Arc<AppState>>,
    Json(request): Json<TranscribeRequest>,
) -> Result<Json<TranscribeResponse>, (StatusCode, Json<ErrorResponse>)> {
    info!("Transcribe request for recording: {}", request.recording_id);

    // Check if model is ready
    {
        let transcriber = state.transcriber.read().await;
        if !transcriber.is_ready() {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: "Transcriber not ready".to_string(),
                }),
            ));
        }
    }

    // Create temp file for downloaded audio
    let temp_file = NamedTempFile::new().map_err(|e| {
        error!("Failed to create temp file: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Internal error".to_string(),
            }),
        )
    })?;

    let temp_path = temp_file.path().to_path_buf();

    // Download from MinIO
    let object_key = state
        .storage
        .normalize_object_key(&request.file_url, &state.bucket_name);

    state
        .storage
        .download_file(object_key, &temp_path)
        .await
        .map_err(|e| {
            error!("Failed to download file: {}", e);
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: format!("Audio file not found: {}", e),
                }),
            )
        })?;

    // Transcribe
    let transcriber = state.transcriber.read().await;
    let result = transcriber.transcribe(&temp_path).await.map_err(|e| {
        error!("Transcription failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Transcription failed: {}", e),
            }),
        )
    })?;

    // Convert segments
    let segments: Vec<SegmentResponse> = result
        .segments
        .into_iter()
        .map(|s| SegmentResponse {
            start: s.start,
            end: s.end,
            text: s.text,
        })
        .collect();

    Ok(Json(TranscribeResponse {
        recording_id: request.recording_id,
        text: result.text,
        segments,
        duration: result.duration,
    }))
}

pub async fn transcribe_batch(
    State(state): State<Arc<AppState>>,
    Json(requests): Json<Vec<TranscribeRequest>>,
) -> Result<Json<BatchResponse>, (StatusCode, Json<ErrorResponse>)> {
    let job_id = Uuid::new_v4().to_string();
    let count = requests.len();

    info!("Batch transcribe job {} with {} files", job_id, count);

    // Initialize job status
    state
        .queue
        .set_job_status(
            &job_id,
            &JobStatus {
                status: "queued".to_string(),
                current: Some(0),
                total: Some(count as u32),
            },
        )
        .await
        .map_err(|e| {
            error!("Failed to set job status: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to queue job".to_string(),
                }),
            )
        })?;

    // Spawn background task
    let state_clone = state.clone();
    let job_id_clone = job_id.clone();
    tokio::spawn(async move {
        process_batch(state_clone, job_id_clone, requests).await;
    });

    Ok(Json(BatchResponse {
        job_id,
        status: "queued".to_string(),
        count,
    }))
}

async fn process_batch(state: Arc<AppState>, job_id: String, requests: Vec<TranscribeRequest>) {
    let total = requests.len();

    for (i, request) in requests.into_iter().enumerate() {
        // Update progress
        let _ = state
            .queue
            .set_job_status(
                &job_id,
                &JobStatus {
                    status: "processing".to_string(),
                    current: Some((i + 1) as u32),
                    total: Some(total as u32),
                },
            )
            .await;

        // Create temp file
        let temp_file = match NamedTempFile::new() {
            Ok(f) => f,
            Err(e) => {
                error!("Failed to create temp file: {}", e);
                let _ = state
                    .queue
                    .set_transcription_result(
                        &request.recording_id,
                        &TranscriptionStatus {
                            status: "failed".to_string(),
                            text: None,
                            duration: None,
                            error: Some(e.to_string()),
                        },
                    )
                    .await;
                continue;
            }
        };

        let temp_path = temp_file.path().to_path_buf();

        // Download
        let object_key = state
            .storage
            .normalize_object_key(&request.file_url, &state.bucket_name);

        if let Err(e) = state.storage.download_file(object_key, &temp_path).await {
            error!("Failed to download {}: {}", request.recording_id, e);
            let _ = state
                .queue
                .set_transcription_result(
                    &request.recording_id,
                    &TranscriptionStatus {
                        status: "failed".to_string(),
                        text: None,
                        duration: None,
                        error: Some(e.to_string()),
                    },
                )
                .await;
            continue;
        }

        // Transcribe
        let transcriber = state.transcriber.read().await;
        match transcriber.transcribe(&temp_path).await {
            Ok(result) => {
                // Store result
                let _ = state
                    .queue
                    .set_transcription_result(
                        &request.recording_id,
                        &TranscriptionStatus {
                            status: "completed".to_string(),
                            text: Some(result.text.clone()),
                            duration: Some(result.duration),
                            error: None,
                        },
                    )
                    .await;

                // Send callback if provided
                if let Some(callback_url) = request.callback_url {
                    let segments: Vec<SegmentResponse> = result
                        .segments
                        .into_iter()
                        .map(|s| SegmentResponse {
                            start: s.start,
                            end: s.end,
                            text: s.text,
                        })
                        .collect();

                    let response = TranscribeResponse {
                        recording_id: request.recording_id.clone(),
                        text: result.text,
                        segments,
                        duration: result.duration,
                    };

                    let _ = reqwest::Client::new()
                        .post(&callback_url)
                        .json(&response)
                        .send()
                        .await;
                }

                info!("Completed transcription for {}", request.recording_id);
            }
            Err(e) => {
                error!("Transcription failed for {}: {}", request.recording_id, e);
                let _ = state
                    .queue
                    .set_transcription_result(
                        &request.recording_id,
                        &TranscriptionStatus {
                            status: "failed".to_string(),
                            text: None,
                            duration: None,
                            error: Some(e.to_string()),
                        },
                    )
                    .await;
            }
        }
    }

    // Mark job as complete
    let _ = state
        .queue
        .set_job_status(
            &job_id,
            &JobStatus {
                status: "completed".to_string(),
                current: Some(total as u32),
                total: Some(total as u32),
            },
        )
        .await;

    info!("Batch job {} completed", job_id);
}

pub async fn get_job_status(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> Result<Json<JobStatus>, (StatusCode, Json<ErrorResponse>)> {
    match state.queue.get_job_status(&job_id).await {
        Ok(Some(status)) => Ok(Json(status)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Job not found".to_string(),
            }),
        )),
        Err(e) => {
            error!("Failed to get job status: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get job status".to_string(),
                }),
            ))
        }
    }
}
