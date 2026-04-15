"""Central configuration for all services.

API keys are loaded from environment variables.
Create a .env file in the backend/ directory or export them in your shell.
"""

import os

# ---------- API Keys ----------
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")

# ---------- STT (Groq Whisper) ----------
GROQ_STT_MODEL = "whisper-large-v3-turbo"

# ---------- VAD (silero, still runs locally — it's tiny) ----------
VAD_THRESHOLD = 0.65
SILENCE_THRESHOLD_MS = 800

# ---------- LLM (Groq) ----------
GROQ_LLM_MODEL = "llama-3.1-8b-instant"
LLM_TEMPERATURE = 0.8
LLM_MAX_TOKENS = 256
LLM_HISTORY_WINDOW = 10

# Evaluation needs more tokens and deterministic output
EVAL_TEMPERATURE = 0.1
EVAL_MAX_TOKENS = 1024

# ---------- TTS (ElevenLabs) ----------
ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # "Rachel" — natural female voice
ELEVENLABS_MODEL = "eleven_turbo_v2_5"
TTS_OUTPUT_FORMAT = "mp3_44100_128"

# ---------- RAG ----------
RAG_EMBEDDING_MODEL = "all-MiniLM-L6-v2"
RAG_CHUNK_SIZE = 512
RAG_CHUNK_OVERLAP = 64
RAG_TOP_K = 5
RAG_MAX_SCRAPE_DEPTH = 2
RAG_MAX_PAGES = 20
