use anyhow::{Context, Result};
use parakeet_rs::{ParakeetTDT, TimestampMode, Transcriber as ParakeetTranscriber};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use tempfile::NamedTempFile;
use tokio::sync::Mutex;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub segments: Vec<Segment>,
    pub duration: f64,
}

pub struct Transcriber {
    engine: Arc<Mutex<Option<ParakeetTDT>>>,
    model_loaded: bool,
}

impl Transcriber {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(Mutex::new(None)),
            model_loaded: false,
        }
    }

    pub async fn load_model(&mut self, model_path: &Path) -> Result<()> {
        info!("Loading Parakeet TDT model from {:?}...", model_path);

        let model_path = model_path.to_path_buf();
        let engine = self.engine.clone();

        // Load model in blocking task (model loading is CPU-intensive)
        tokio::task::spawn_blocking(move || {
            let parakeet = ParakeetTDT::from_pretrained(&model_path, None)
                .context("Failed to load Parakeet TDT model")?;

            let mut guard = futures::executor::block_on(engine.lock());
            *guard = Some(parakeet);
            Ok::<_, anyhow::Error>(())
        })
        .await??;

        self.model_loaded = true;
        info!("Parakeet TDT model loaded successfully!");
        Ok(())
    }

    pub fn is_ready(&self) -> bool {
        self.model_loaded
    }

    /// Convert audio to WAV format if needed (using ffmpeg)
    async fn ensure_wav_format(&self, audio_path: &Path) -> Result<Option<NamedTempFile>> {
        let extension = audio_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        // If already WAV, no conversion needed
        if extension == "wav" {
            return Ok(None);
        }

        info!("Converting {} to WAV format", audio_path.display());

        // Create temp file for WAV output
        let temp_wav = NamedTempFile::new().context("Failed to create temp WAV file")?;
        let wav_path = temp_wav.path().to_path_buf();

        let audio_path_clone = audio_path.to_path_buf();

        // Run ffmpeg conversion in blocking task
        tokio::task::spawn_blocking(move || {
            let output = Command::new("ffmpeg")
                .args([
                    "-i", audio_path_clone.to_str().unwrap(),
                    "-ar", "16000",     // 16kHz sample rate (optimal for speech)
                    "-ac", "1",         // mono
                    "-f", "wav",        // WAV format
                    "-y",               // overwrite
                    wav_path.to_str().unwrap(),
                ])
                .output()
                .context("Failed to run ffmpeg")?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                warn!("ffmpeg stderr: {}", stderr);
                anyhow::bail!("ffmpeg conversion failed: {}", stderr);
            }

            info!("Audio converted to WAV successfully");
            Ok::<_, anyhow::Error>(())
        })
        .await??;

        Ok(Some(temp_wav))
    }

    pub async fn transcribe(&self, audio_path: &Path) -> Result<TranscriptionResult> {
        if !self.model_loaded {
            anyhow::bail!("Model not loaded");
        }

        // Convert to WAV if needed (parakeet-rs requires WAV format)
        let wav_path = self.ensure_wav_format(audio_path).await?;
        let audio_path_for_transcription = wav_path.as_ref().map(|p| p.path().to_path_buf())
            .unwrap_or_else(|| audio_path.to_path_buf());
        let audio_path_for_duration = audio_path_for_transcription.clone();
        let engine = self.engine.clone();

        // Run transcription in blocking task (inference is CPU-intensive)
        let result = tokio::task::spawn_blocking(move || {
            let mut guard = futures::executor::block_on(engine.lock());
            let parakeet = guard.as_mut().ok_or_else(|| anyhow::anyhow!("Model not initialized"))?;

            parakeet
                .transcribe_file(&audio_path_for_transcription, Some(TimestampMode::Words))
                .context("Transcription failed")
        })
        .await??;

        // Convert tokens to segments with timestamps
        let segments: Vec<Segment> = result
            .tokens
            .iter()
            .map(|token| Segment {
                start: token.start as f64,
                end: token.end as f64,
                text: token.text.clone(),
            })
            .collect();

        // Calculate duration from last token or audio file
        let duration = segments
            .last()
            .map(|s| s.end)
            .unwrap_or_else(|| get_audio_duration(&audio_path_for_duration).unwrap_or(0.0));

        Ok(TranscriptionResult {
            text: result.text,
            segments,
            duration,
        })
    }
}

fn get_audio_duration(path: &Path) -> Result<f64> {
    let reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    let num_samples = reader.len() as f64;
    let sample_rate = spec.sample_rate as f64;
    let channels = spec.channels as f64;
    Ok(num_samples / sample_rate / channels)
}

impl Default for Transcriber {
    fn default() -> Self {
        Self::new()
    }
}
