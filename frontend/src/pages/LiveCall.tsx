import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { createCallSocket } from "../lib/websocket";

interface TranscriptEntry {
  role: "representative" | "customer";
  text: string;
}

type CallState = "idle" | "ready" | "recording" | "processing" | "speaking";

export default function LiveCall() {
  const { callId: callIdStr } = useParams();
  const callId = Number(callIdStr);
  const navigate = useNavigate();

  const [state, setState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [timerMs, setTimerMs] = useState(0);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [throttleMsg, setThrottleMsg] = useState<string | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const playingRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerStartRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingRef = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const nativeSRRef = useRef(48000);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    if (state === "processing") {
      timerStartRef.current = performance.now();
      setTimerMs(0);
      timerIntervalRef.current = setInterval(() => {
        if (timerStartRef.current !== null) {
          setTimerMs(performance.now() - timerStartRef.current);
        }
      }, 50);
    } else if (state === "speaking" || state === "ready") {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (state === "speaking" && timerStartRef.current !== null) {
        setLastLatency(performance.now() - timerStartRef.current);
      }
      timerStartRef.current = null;
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [state]);

  const playNextAudio = useCallback(async () => {
    if (playingRef.current || audioQueueRef.current.length === 0) return;
    playingRef.current = true;
    const buf = audioQueueRef.current.shift()!;
    const ctx = audioCtxRef.current || new AudioContext();
    audioCtxRef.current = ctx;
    try {
      const decoded = await ctx.decodeAudioData(buf);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = () => {
        playingRef.current = false;
        playNextAudio();
      };
      source.start();
    } catch {
      playingRef.current = false;
      playNextAudio();
    }
  }, []);

  const initMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;

    const ctx = audioCtxRef.current || new AudioContext();
    audioCtxRef.current = ctx;
    nativeSRRef.current = ctx.sampleRate;

    const sourceNode = ctx.createMediaStreamSource(stream);
    sourceNodeRef.current = sourceNode;

    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    const TARGET_SR = 16000;

    processor.onaudioprocess = (e) => {
      if (!recordingRef.current) return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      const float32 = e.inputBuffer.getChannelData(0);
      const nativeSR = nativeSRRef.current;

      let resampled: Float32Array;
      if (nativeSR === TARGET_SR) {
        resampled = float32;
      } else {
        const ratio = nativeSR / TARGET_SR;
        const outLen = Math.round(float32.length / ratio);
        resampled = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const srcIdx = i * ratio;
          const idx = Math.floor(srcIdx);
          const frac = srcIdx - idx;
          const a = float32[idx] ?? 0;
          const b = float32[Math.min(idx + 1, float32.length - 1)] ?? 0;
          resampled[i] = a + frac * (b - a);
        }
      }

      const int16 = new Int16Array(resampled.length);
      for (let i = 0; i < resampled.length; i++) {
        const s = Math.max(-1, Math.min(1, resampled[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      wsRef.current.send(int16.buffer);
    };

    sourceNode.connect(processor);
    processor.connect(ctx.destination);
  }, []);

  const connectWs = useCallback(() => {
    const ws = createCallSocket(callId);
    wsRef.current = ws;

    ws.onopen = async () => {
      setConnected(true);
      await initMic();
      setState("ready");
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        audioQueueRef.current.push(ev.data);
        playNextAudio();
        return;
      }
      if (typeof ev.data === "string" && ev.data.startsWith("{")) {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "state") {
            const s = msg.state as string;
            if (s === "listening") {
              setState("ready");
            } else if (s === "processing") {
              setState("processing");
            } else if (s === "speaking") {
              setState("speaking");
            }
          } else if (msg.type === "transcript") {
            setTranscript((prev) => [...prev, { role: msg.role, text: msg.text }]);
          } else if (msg.type === "throttle") {
            setThrottleMsg(`Rate limit: waiting ${msg.delay_s}s before ${msg.provider} call`);
            if (throttleTimeoutRef.current) clearTimeout(throttleTimeoutRef.current);
            throttleTimeoutRef.current = setTimeout(() => setThrottleMsg(null), 5000);
          }
        } catch {
          /* ignore */
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setState("idle");
    };
  }, [callId, playNextAudio, initMic]);

  useEffect(() => {
    connectWs();
    return () => {
      processorRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current?.close();
    };
  }, [connectWs]);

  function startRecording() {
    if (state !== "ready") return;
    recordingRef.current = true;
    recordingStartRef.current = performance.now();
    setRecordingMs(0);
    setState("recording");
    wsRef.current?.send(JSON.stringify({ type: "start_speech" }));
    recordingTimerRef.current = setInterval(() => {
      if (recordingStartRef.current !== null) {
        setRecordingMs(performance.now() - recordingStartRef.current);
      }
    }, 50);
  }

  function stopRecording() {
    if (state !== "recording") return;
    recordingRef.current = false;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recordingStartRef.current = null;
    wsRef.current?.send(JSON.stringify({ type: "end_speech" }));
  }

  async function handleEndCall() {
    recordingRef.current = false;
    processorRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_call" }));
      await new Promise<void>((resolve) => {
        const ws = wsRef.current!;
        const onClose = () => { ws.removeEventListener("close", onClose); resolve(); };
        ws.addEventListener("close", onClose);
        setTimeout(() => { resolve(); }, 2000);
      });
    }

    try {
      await api.endCall(callId);
    } catch {
      /* ignore */
    }
    navigate(`/report/${callId}`);
  }

  function formatMs(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const stateLabel: Record<CallState, string> = {
    idle: "CONNECTING...",
    ready: "YOUR TURN - HOLD MIC TO SPEAK",
    recording: "RECORDING - RELEASE TO SEND",
    processing: "PROCESSING...",
    speaking: "AI SPEAKING - WAIT",
  };

  const stateColors: Record<CallState, string> = {
    idle: "bg-gray-700",
    ready: "bg-green-600",
    recording: "bg-red-600",
    processing: "bg-yellow-600",
    speaking: "bg-indigo-600",
  };

  const canRecord = state === "ready";
  const isRecording = state === "recording";
  const isBusy = state === "processing" || state === "speaking";

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Status bar */}
      <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-4 mb-3">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm text-gray-400">
            {connected ? "Connected" : "Disconnected"}
          </span>
          <span className={`ml-3 px-3 py-1 rounded-full text-xs font-semibold text-white ${stateColors[state]}`}>
            {stateLabel[state]}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {state === "processing" && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
              </span>
              <span className="text-sm font-mono text-yellow-400">{formatMs(timerMs)}</span>
            </div>
          )}
          {state !== "processing" && lastLatency !== null && (
            <span className="text-xs text-gray-500 font-mono">Last: {formatMs(lastLatency)}</span>
          )}
          <button
            onClick={handleEndCall}
            className="bg-red-700 hover:bg-red-600 text-white rounded-lg px-5 py-2 text-sm font-medium transition"
          >
            End Call
          </button>
        </div>
      </div>

      {/* Throttle banner */}
      {throttleMsg && (
        <div className="flex items-center gap-2 bg-amber-900/60 border border-amber-700 rounded-lg px-4 py-2 mb-3 text-amber-200 text-sm animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {throttleMsg}
        </div>
      )}

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 mb-3">
        {transcript.length === 0 && (
          <p className="text-gray-500 text-center mt-12">
            Hold the microphone button below and speak, then release to send.
          </p>
        )}
        {transcript.map((entry, i) => (
          <div key={i} className={`flex ${entry.role === "representative" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                entry.role === "representative"
                  ? "bg-indigo-900/50 text-indigo-100"
                  : "bg-gray-800 text-gray-200"
              }`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wider mb-1 opacity-60">
                {entry.role === "representative" ? "You (CSR)" : "Customer (AI)"}
              </span>
              {entry.text}
            </div>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>

      {/* Push-to-talk controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col items-center gap-3">
        {isRecording && (
          <div className="flex items-center gap-2 text-red-400 text-sm font-mono">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            Recording: {formatMs(recordingMs)}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => { if (isRecording) stopRecording(); }}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            disabled={!canRecord && !isRecording}
            className={`
              relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-150 select-none
              ${isRecording
                ? "bg-red-600 scale-110 shadow-lg shadow-red-600/40 ring-4 ring-red-400/50"
                : canRecord
                  ? "bg-green-600 hover:bg-green-500 hover:scale-105 shadow-lg shadow-green-600/30 cursor-pointer"
                  : "bg-gray-700 opacity-50 cursor-not-allowed"
              }
            `}
          >
            {isRecording ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-16a3 3 0 00-3 3v4a3 3 0 006 0V8a3 3 0 00-3-3z" />
              </svg>
            )}
          </button>

          {isBusy && (
            <div className="text-gray-400 text-sm max-w-[12rem] text-center">
              {state === "processing" ? "Thinking..." : "AI is speaking, please wait..."}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500">
          {canRecord
            ? "Hold the mic button to speak, release when done"
            : isRecording
              ? "Release to send your message"
              : "Wait for the AI to finish before speaking"}
        </p>
      </div>
    </div>
  );
}
