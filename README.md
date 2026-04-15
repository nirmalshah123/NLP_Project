# Dynamic Adversarial Dialogue

An end-to-end NLP pipeline for customer service training and evaluation.

An AI "difficult customer" engages CSRs in realistic voice conversations via the browser, then automatically evaluates their de-escalation performance.

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- A [Groq API key](https://console.groq.com/keys) (free tier)
- An [ElevenLabs API key](https://elevenlabs.io) (free tier)

### 1. Set up API keys

```bash
cd backend
cp .env.example .env
# Edit .env and paste your keys:
#   GROQ_API_KEY=gsk_...
#   ELEVENLABS_API_KEY=...
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Architecture

Browser mic → WebSocket → Groq Whisper (STT) → Groq Llama 3 (persona) → ElevenLabs (TTS) → browser speaker

Post-call: transcript → Groq Llama 3 (evaluator) → scores + coaching → dashboard

## Cloud APIs Used

| Service | Provider | What it does | Free tier |
|---------|----------|-------------|-----------|
| STT | Groq (Whisper) | Speech-to-text transcription | Yes |
| LLM | Groq (Llama 3.1 8B) | Adversarial persona + evaluation | Yes |
| TTS | ElevenLabs | Text-to-speech with emotional voices | 10k chars/mo |
| RAG | Local (FAISS + sentence-transformers) | Web scraping + retrieval | N/A |
