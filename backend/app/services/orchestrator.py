from __future__ import annotations

import enum
import json
import logging
import time
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class TurnState(enum.Enum):
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"


class CallSession:
    """Manages the real-time voice loop for a single call.

    Uses push-to-talk: the frontend signals start_speech / end_speech
    and only streams audio between those two events.
    """

    def __init__(
        self,
        call_id: int,
        scenario_id: int,
        persona_type: str,
        objective: str,
        difficulty: int,
    ) -> None:
        self.call_id = call_id
        self.scenario_id = scenario_id
        self.persona_type = persona_type
        self.objective = objective
        self.difficulty = difficulty

        self.state = TurnState.LISTENING
        self.history: list[dict[str, str]] = []
        self.transcript_lines: list[str] = []
        self._system_prompt: Optional[str] = None
        self._audio_buffer = None
        self._recording = False

    def _get_audio_buffer(self):
        if self._audio_buffer is None:
            from app.services.stt import AudioBuffer
            self._audio_buffer = AudioBuffer()
        return self._audio_buffer

    def _get_system_prompt(self) -> str:
        if self._system_prompt is None:
            from app.prompts.persona import build_system_prompt
            from app.services.rag import get_rag

            rag_index = get_rag(self.scenario_id)
            context = ""
            if rag_index:
                chunks = rag_index.query(self.objective)
                context = "\n---\n".join(chunks)
            self._system_prompt = build_system_prompt(
                self.persona_type, self.objective, context, self.difficulty
            )
        return self._system_prompt

    async def handle_websocket(self, ws: WebSocket) -> None:
        await ws.accept()
        await ws.send_text(json.dumps({"type": "state", "state": self.state.value}))

        audio_buffer = self._get_audio_buffer()

        try:
            while True:
                data = await ws.receive()

                if data.get("type") == "websocket.disconnect":
                    break

                if "bytes" in data and self._recording and self.state == TurnState.LISTENING:
                    pcm_bytes: bytes = data["bytes"]
                    audio_buffer.add_chunk_no_vad(pcm_bytes)

                elif "text" in data:
                    msg = json.loads(data["text"])
                    msg_type = msg.get("type")

                    if msg_type == "end_call":
                        break

                    elif msg_type == "start_speech":
                        if self.state == TurnState.LISTENING:
                            self._recording = True
                            audio_buffer.reset()
                            logger.info("call=%d push-to-talk START", self.call_id)

                    elif msg_type == "end_speech":
                        if self._recording:
                            self._recording = False
                            logger.info("call=%d push-to-talk END", self.call_id)
                            await self._process_turn(ws)

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected for call %d", self.call_id)
        except Exception:
            logger.exception("Error in call session %d", self.call_id)

    async def _process_turn(self, ws: WebSocket) -> None:
        from app.services import llm, stt, tts
        from app.services.profiler import profile_step
        from app.services.rate_limiter import set_notify

        async def _on_throttle(provider: str, delay: float) -> None:
            await ws.send_text(json.dumps({
                "type": "throttle",
                "provider": provider,
                "delay_s": round(delay, 1),
            }))

        set_notify(_on_throttle)

        self.state = TurnState.PROCESSING
        await ws.send_text(json.dumps({"type": "state", "state": self.state.value}))

        t0 = time.perf_counter()

        audio_buffer = self._get_audio_buffer()

        with profile_step(self.call_id, "stt"):
            user_text = await stt.transcribe(audio_buffer)
        audio_buffer.reset()

        if not user_text.strip():
            self.state = TurnState.LISTENING
            await ws.send_text(json.dumps({"type": "state", "state": self.state.value}))
            return

        stt_ms = (time.perf_counter() - t0) * 1000
        logger.info("call=%d stt=%.0fms text=%r", self.call_id, stt_ms, user_text[:80])

        self.transcript_lines.append(f"REPRESENTATIVE: {user_text}")
        await ws.send_text(json.dumps({
            "type": "transcript",
            "role": "representative",
            "text": user_text,
        }))

        system_prompt = self._get_system_prompt()
        full_response: list[str] = []
        sentence_buffer: list[str] = []

        self.state = TurnState.SPEAKING
        await ws.send_text(json.dumps({"type": "state", "state": self.state.value}))

        llm_t0 = time.perf_counter()
        first_token_time = None
        async for token in llm.chat_stream(system_prompt, self.history, user_text):
            if first_token_time is None:
                first_token_time = time.perf_counter()
            full_response.append(token)
            await ws.send_text(json.dumps({"type": "assistant_delta", "delta": token}))
            sentence_buffer.append(token)

            current_sentence = "".join(sentence_buffer)
            if any(current_sentence.rstrip().endswith(p) for p in ".!?"):
                with profile_step(self.call_id, "tts"):
                    audio = await tts.synthesize(current_sentence.strip())
                if audio:
                    await ws.send_bytes(audio)
                sentence_buffer.clear()

        llm_elapsed = (time.perf_counter() - llm_t0) * 1000
        ttft = ((first_token_time - llm_t0) * 1000) if first_token_time else 0
        logger.info(
            "call=%d llm_total=%.0fms ttft=%.0fms tokens=%d",
            self.call_id, llm_elapsed, ttft, len(full_response),
        )

        if sentence_buffer:
            leftover = "".join(sentence_buffer).strip()
            if leftover:
                with profile_step(self.call_id, "tts"):
                    audio = await tts.synthesize(leftover)
                if audio:
                    await ws.send_bytes(audio)

        response_text = "".join(full_response).strip()
        self.transcript_lines.append(f"CUSTOMER: {response_text}")
        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": response_text})

        await ws.send_text(json.dumps({
            "type": "transcript",
            "role": "customer",
            "text": response_text,
        }))

        elapsed = time.perf_counter() - t0
        await ws.send_text(json.dumps({
            "type": "latency",
            "turn_ms": round(elapsed * 1000, 1),
        }))
        logger.info("Turn processed in %.2fs for call %d", elapsed, self.call_id)

        self.state = TurnState.LISTENING
        await ws.send_text(json.dumps({"type": "state", "state": self.state.value}))

    def get_transcript(self) -> str:
        return "\n".join(self.transcript_lines)
