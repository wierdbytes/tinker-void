import asyncio
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


async def convert_to_wav(input_path: Path, sample_rate: int = 16000) -> Path:
    """Convert audio file to WAV format for Whisper.

    Uses asyncio subprocess to avoid blocking the event loop during conversion.

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

    # Run ffmpeg conversion asynchronously
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-i", str(input_path),
        "-ar", str(sample_rate),  # 16kHz sample rate
        "-ac", "1",  # Mono
        "-f", "wav",  # WAV format
        "-y",  # Overwrite
        str(output_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    _, stderr = await process.communicate()

    if process.returncode != 0:
        error_msg = stderr.decode() if stderr else "Unknown error"
        logger.error(f"ffmpeg error: {error_msg}")
        raise RuntimeError(f"Audio conversion failed: {error_msg}")

    logger.info(f"Converted to {output_path}")
    return output_path
