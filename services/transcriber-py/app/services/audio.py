import logging
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


async def convert_to_wav(input_path: Path, sample_rate: int = 16000) -> Path:
    """Convert audio file to WAV format for Whisper.

    Args:
        input_path: Path to input audio file
        sample_rate: Target sample rate (16000 Hz optimal for Whisper)

    Returns:
        Path to converted WAV file (temp file, caller must clean up)
    """
    # Check if already WAV with correct sample rate
    if input_path.suffix.lower() == ".wav":
        return input_path

    # Create temp file for output
    temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    output_path = Path(temp_wav.name)
    temp_wav.close()

    logger.info(f"Converting {input_path} to WAV format")

    # Run ffmpeg conversion
    cmd = [
        "ffmpeg",
        "-i",
        str(input_path),
        "-ar",
        str(sample_rate),  # 16kHz sample rate
        "-ac",
        "1",  # Mono
        "-f",
        "wav",  # WAV format
        "-y",  # Overwrite
        str(output_path),
    ]

    process = subprocess.run(cmd, capture_output=True, text=True)

    if process.returncode != 0:
        logger.error(f"ffmpeg error: {process.stderr}")
        raise RuntimeError(f"Audio conversion failed: {process.stderr}")

    logger.info(f"Converted to {output_path}")
    return output_path
