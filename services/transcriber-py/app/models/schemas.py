from pydantic import BaseModel, Field
from typing import Optional, List


class TranscribeRequest(BaseModel):
    """Request for transcription."""

    file_url: str = Field(..., description="S3 object key or relative path")
    recording_id: str = Field(..., description="Recording ID for tracking")
    callback_url: Optional[str] = Field(None, description="URL for async callback")


class SegmentResponse(BaseModel):
    """Single transcription segment with timing."""

    start: float
    end: float
    text: str


class TranscribeResponse(BaseModel):
    """Response with transcription results."""

    recording_id: str
    text: str
    segments: List[SegmentResponse]
    duration: float


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    model_loaded: bool
    rabbitmq_connected: bool = False


class BatchResponse(BaseModel):
    """Response for batch transcription job."""

    job_id: str
    status: str
    count: int


class JobStatus(BaseModel):
    """Status of a batch job."""

    status: str
    current: Optional[int] = None
    total: Optional[int] = None
