from __future__ import annotations

import io
import logging
import struct
import wave
from typing import Optional

import numpy as np
import torch

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000

_vad_model = None
_vad_utils = None


def _get_vad():
    global _vad_model, _vad_utils
    if _vad_model is None:
        _vad_model, _vad_utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad", model="silero_vad", onnx=True
        )
        logger.info("Silero VAD loaded")
    return _vad_model, _vad_utils


class AudioBuffer:
    """Accumulates raw 16-bit 16kHz mono PCM."""

    def __init__(self) -> None:
        self._chunks: list[bytes] = []
        self._silent_frames: int = 0
        self._has_speech: bool = False

    def add_chunk_no_vad(self, pcm_bytes: bytes) -> None:
        """Append PCM data without running VAD (for push-to-talk mode)."""
        self._chunks.append(pcm_bytes)

    def add_chunk(self, pcm_bytes: bytes) -> bool:
        """Add PCM chunk. Returns True when silence is detected after speech.

        Silero VAD requires exactly 512 samples per call at 16kHz.
        """
        from app.config import SILENCE_THRESHOLD_MS, VAD_THRESHOLD

        self._chunks.append(pcm_bytes)

        audio_float = _pcm_to_float(pcm_bytes)
        if len(audio_float) == 0:
            return False

        vad_model, _ = _get_vad()

        vad_window = 512
        offset = 0
        while offset + vad_window <= len(audio_float):
            window = audio_float[offset : offset + vad_window]
            speech_prob = vad_model(
                torch.from_numpy(window), SAMPLE_RATE
            ).item()

            if speech_prob >= VAD_THRESHOLD:
                self._has_speech = True
                self._silent_frames = 0
            else:
                window_ms = vad_window / SAMPLE_RATE * 1000
                self._silent_frames += int(window_ms)

            if self._has_speech and self._silent_frames >= SILENCE_THRESHOLD_MS:
                return True

            offset += vad_window

        return False

    def get_audio(self) -> np.ndarray:
        raw = b"".join(self._chunks)
        return _pcm_to_float(raw)

    def get_wav_bytes(self) -> bytes:
        """Return accumulated audio as a WAV file in memory (for Groq API upload)."""
        raw = b"".join(self._chunks)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(raw)
        buf.seek(0)
        return buf.getvalue()

    def reset(self) -> None:
        self._chunks.clear()
        self._silent_frames = 0
        self._has_speech = False


MIN_AUDIO_DURATION_S = 0.6

HALLUCINATION_PHRASES = {
    "thank you",
    "thanks for watching",
    "subscribe",
    "like and subscribe",
    "please subscribe",
    "thank you for watching",
    "thanks for listening",
    "thank you for listening",
    "the end",
    "bye",
    "goodbye",
    "see you next time",
    "you",
    "i'm sorry",
    "",
}

WHISPER_PROMPT = (
    "This is a live customer service phone call. "
    "The representative is speaking to an AI customer. "
    "Transcribe the representative's speech accurately."
)


async def transcribe(audio_buffer: AudioBuffer) -> str:
    """Transcribe audio using Groq Whisper API."""
    from groq import Groq

    from app.config import GROQ_API_KEY, GROQ_STT_MODEL
    from app.services.rate_limiter import wait_for

    wav_bytes = audio_buffer.get_wav_bytes()
    if len(wav_bytes) < 100:
        return ""

    raw_pcm = b"".join(audio_buffer._chunks)
    num_samples = len(raw_pcm) // 2
    duration_s = num_samples / SAMPLE_RATE
    if duration_s < MIN_AUDIO_DURATION_S:
        logger.debug("Audio too short (%.2fs), skipping transcription", duration_s)
        return ""

    audio_float = audio_buffer.get_audio()
    rms = float(np.sqrt(np.mean(audio_float ** 2)))
    if rms < 0.005:
        logger.debug("Audio too quiet (rms=%.4f), skipping transcription", rms)
        return ""

    await wait_for("groq")

    client = Groq(api_key=GROQ_API_KEY)
    wav_file = io.BytesIO(wav_bytes)
    wav_file.name = "audio.wav"

    transcription = client.audio.transcriptions.create(
        file=("audio.wav", wav_file),
        model=GROQ_STT_MODEL,
        language="en",
        response_format="text",
        prompt=WHISPER_PROMPT,
        temperature=0.0,
    )
    text = transcription.strip() if isinstance(transcription, str) else str(transcription).strip()

    if text.lower().strip(".!?, ") in HALLUCINATION_PHRASES:
        logger.info("Filtered hallucination: %r", text)
        return ""

    if len(text.split()) <= 1 and duration_s < 1.0:
        logger.info("Filtered likely hallucination (single word, short audio): %r", text)
        return ""

    return text


def _pcm_to_float(pcm_bytes: bytes) -> np.ndarray:
    if len(pcm_bytes) < 2:
        return np.array([], dtype=np.float32)
    count = len(pcm_bytes) // 2
    samples = struct.unpack(f"<{count}h", pcm_bytes[: count * 2])
    return np.array(samples, dtype=np.float32) / 32768.0
