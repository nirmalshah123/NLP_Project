import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, Scenario } from "../lib/api";
import { createCallSocket } from "../lib/websocket";

interface TranscriptEntry {
  role: "representative" | "customer";
  text: string;
}

type CallState = "idle" | "ready" | "recording" | "processing" | "speaking";

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.2 4.9L18 8l-5 1.1L12 14l-1-5.9L6 8l4.8-1.1L12 2zm0 10l.9 3.8L16 17l-4 1-1 4-1-4-4-1 3.1-1.2L12 12z" />
    </svg>
  );
}

function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function IconThumbUp({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
    </svg>
  );
}

function IconVolume({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconDotsVertical({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 2.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm0 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
    </svg>
  );
}

function CustomerTypingRow({ timerLabel }: { timerLabel?: string }) {
  return (
    <div className="flex items-center gap-2 px-2 text-zinc-400 lg:px-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient p-px">
        <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-950">
          <SparkleIcon className="h-4 w-4 animate-pulse text-fuchsia-300" />
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-[rgba(30,30,30,0.88)] px-4 py-2.5">
        <span className="sr-only">Customer is typing</span>
        <span className="flex gap-1" aria-hidden>
          <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" />
        </span>
        {timerLabel !== undefined ? (
          <span className="ml-2 font-mono text-xs text-zinc-500">{timerLabel}</span>
        ) : null}
      </div>
    </div>
  );
}

function AiBubbleFooter({ text, onCopied }: { text: string; onCopied: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              onCopied();
            } catch {
              /* ignore */
            }
          }}
          className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300"
          aria-label="Copy message"
        >
          <IconCopy className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300"
          aria-label="Mark helpful"
        >
          <IconThumbUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300"
          aria-label="Speak (not available)"
          disabled
          title="Playback is automatic during the call"
        >
          <IconVolume className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300"
        aria-label="Regenerate (not available)"
        disabled
        title="Regenerate is not available in training mode"
      >
        <IconRefresh className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function LiveCall() {
  const { callId: callIdStr } = useParams();
  const callId = Number(callIdStr);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scenarioIdParam = searchParams.get("scenarioId");
  const scenarioId = scenarioIdParam ? Number(scenarioIdParam) : NaN;

  const [state, setState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [timerMs, setTimerMs] = useState(0);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [throttleMsg, setThrottleMsg] = useState<string | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [streamingCustomerText, setStreamingCustomerText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

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
    if (!Number.isFinite(scenarioId)) {
      setScenario(null);
      return;
    }
    api
      .getScenario(scenarioId)
      .then(setScenario)
      .catch(() => setScenario(null));
  }, [scenarioId]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, state, streamingCustomerText]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

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
              setStreamingCustomerText("");
              setState("processing");
            } else if (s === "speaking") {
              setState("speaking");
            }
          } else if (msg.type === "assistant_delta" && typeof msg.delta === "string") {
            setStreamingCustomerText((prev) => prev + msg.delta);
          } else if (msg.type === "transcript") {
            if (msg.role === "customer") {
              setStreamingCustomerText("");
            }
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
    setMenuOpen(false);
    recordingRef.current = false;
    processorRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_call" }));
      await new Promise<void>((resolve) => {
        const ws = wsRef.current!;
        const onClose = () => {
          ws.removeEventListener("close", onClose);
          resolve();
        };
        ws.addEventListener("close", onClose);
        setTimeout(() => {
          resolve();
        }, 2000);
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
    idle: "Connecting...",
    ready: "Your turn - hold mic to speak",
    recording: "Recording - release to send",
    processing: "Customer is thinking...",
    speaking: "Customer is speaking - wait",
  };

  const liveStatusText = `${connected ? "Connected" : "Disconnected"}. ${stateLabel[state]}.`;

  const canRecord = state === "ready";
  const isRecording = state === "recording";
  const isBusy = state === "processing" || state === "speaking";

  const subtitle =
    scenario?.objective ??
    (Number.isFinite(scenarioId) ? "Loading scenario..." : "Voice training session");

  const headerTitle = scenario?.persona_type ? `Training · ${scenario.persona_type}` : "Live training";

  function showCopyToast() {
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  }

  return (
    <div className="mx-auto flex w-full min-h-[calc(100vh-5rem)] max-w-lg flex-col bg-transparent md:max-w-2xl lg:max-w-4xl xl:max-w-5xl">
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatusText}
        {state === "processing" ? ` Elapsed ${formatMs(timerMs)}.` : ""}
        {lastLatency !== null && state !== "processing" ? ` Last response ${formatMs(lastLatency)}.` : ""}
      </span>

      {/* Chat header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-black/90 py-3 backdrop-blur-md lg:gap-4 lg:py-4">
        <Link
          to="/"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-900/80 text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
          aria-label="Back to scenarios"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient p-0.5 shadow-glow-sm ring-1 ring-white/20">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-black/20">
              <SparkleIcon className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-white lg:text-lg">{headerTitle}</h1>
            <p className="line-clamp-2 text-sm text-zinc-400 lg:text-base">{subtitle}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
              <span
                className={`inline-flex items-center gap-1.5 ${connected ? "text-emerald-400/90" : "text-red-400/90"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} aria-hidden />
                {connected ? "Connected" : "Disconnected"}
              </span>
              {scenario && (
                <>
                  <span aria-hidden>·</span>
                  <span>Difficulty {scenario.difficulty}/10</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            aria-label="Call menu"
          >
            <IconDotsVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] rounded-2xl border border-white/10 bg-zinc-900 py-1 shadow-xl ring-1 ring-black/50"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleEndCall}
                className="w-full px-4 py-3 text-left text-sm font-medium text-red-300 transition hover:bg-red-950/50"
              >
                End call
              </button>
            </div>
          )}
        </div>
      </header>

      {throttleMsg && (
        <div className="mt-2 rounded-2xl border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-xs text-amber-100" role="status">
          {throttleMsg}
        </div>
      )}

      {copyToast && (
        <div className="mt-2 text-center text-xs font-medium text-emerald-400/90" role="status">
          Copied to clipboard
        </div>
      )}

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 lg:space-y-5 lg:py-6">
        {transcript.length === 0 && state !== "processing" && state !== "speaking" && (
          <p className="mx-auto max-w-2xl px-2 pt-8 text-center text-sm leading-relaxed text-zinc-400 lg:text-base">
            Messages appear here as you and the customer speak. Use the microphone below - hold to talk, release to
            send.
          </p>
        )}

        {transcript.map((entry, i) =>
          entry.role === "representative" ? (
            <div key={i} className="flex flex-row items-end justify-end gap-2 px-1 lg:px-2">
              <div className="max-w-[min(85%,20rem)] rounded-full bg-brand-gradient px-4 py-3 text-sm font-medium leading-snug text-white shadow-glow-sm ring-1 ring-white/15 md:max-w-[min(80%,28rem)] md:px-5 md:py-3.5 md:text-base lg:max-w-[min(75%,36rem)]">
                {entry.text}
              </div>
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-zinc-800 text-xs font-bold text-zinc-200"
                aria-hidden
              >
                You
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-row items-end gap-2 px-1 lg:px-2">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient p-px shadow-sm ring-1 ring-white/15 lg:h-10 lg:w-10"
                aria-hidden
              >
                <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-950">
                  <SparkleIcon className="h-4 w-4 text-fuchsia-300" />
                </div>
              </div>
              <div className="max-w-[min(92%,22rem)] rounded-[1.25rem] border border-white/10 bg-[rgba(30,30,30,0.88)] px-4 py-3 text-sm leading-relaxed text-zinc-100 backdrop-blur-sm md:max-w-[min(88%,32rem)] md:px-5 md:py-3.5 md:text-base lg:max-w-[min(82%,42rem)]">
                <p className="whitespace-pre-wrap">{entry.text}</p>
                <AiBubbleFooter text={entry.text} onCopied={showCopyToast} />
              </div>
            </div>
          ),
        )}

        {state === "processing" && <CustomerTypingRow timerLabel={formatMs(timerMs)} />}

        {state === "speaking" && streamingCustomerText === "" && <CustomerTypingRow />}

        {state === "speaking" && streamingCustomerText !== "" && (
          <div className="flex flex-row items-end gap-2 px-1 lg:px-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient p-px shadow-sm ring-1 ring-white/15 lg:h-10 lg:w-10"
              aria-hidden
            >
              <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-950">
                <SparkleIcon className="h-4 w-4 text-fuchsia-300" />
              </div>
            </div>
            <div className="max-w-[min(92%,22rem)] rounded-[1.25rem] border border-fuchsia-500/25 bg-[rgba(30,30,30,0.88)] px-4 py-3 text-sm leading-relaxed text-zinc-100 backdrop-blur-sm md:max-w-[min(88%,32rem)] md:px-5 md:py-3.5 md:text-base lg:max-w-[min(82%,42rem)]">
              <p className="whitespace-pre-wrap">
                {streamingCustomerText}
                <span
                  className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-fuchsia-400/90 align-middle"
                  aria-hidden
                />
              </p>
            </div>
          </div>
        )}

        <div ref={transcriptEndRef} />
      </div>

      {/* Quick suggestion + composer */}
      <div className="sticky bottom-0 z-20 border-t border-white/10 bg-gradient-to-t from-black via-black to-transparent pb-2 pt-3 lg:pb-4 lg:pt-4">
        {canRecord && (
          <div
            className="mb-3 rounded-full bg-brand-gradient px-4 py-3 text-left text-sm font-medium text-white shadow-glow-sm ring-1 ring-white/15 lg:px-5 lg:py-3.5 lg:text-base"
            role="note"
          >
            Tip: hold the mic, speak clearly, then release to send your reply.
          </div>
        )}

        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-zinc-900/90 py-2 pl-4 pr-2 shadow-inner backdrop-blur-md lg:gap-3 lg:py-2.5 lg:pl-5 lg:pr-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-500 lg:text-base">
              {isRecording
                ? `Recording... ${formatMs(recordingMs)}`
                : isBusy
                  ? state === "processing"
                    ? "Customer is thinking..."
                    : streamingCustomerText
                      ? "Customer reply streaming…"
                      : "Customer is typing…"
                  : canRecord
                    ? "Hold mic to speak..."
                    : "Wait for your turn..."}
            </p>
            {lastLatency !== null && !isBusy && state === "ready" && (
              <p className="truncate text-xs text-zinc-600">Last reply: {formatMs(lastLatency)}</p>
            )}
          </div>
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => {
              if (isRecording) stopRecording();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              startRecording();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopRecording();
            }}
            disabled={!canRecord && !isRecording}
            aria-label={
              isRecording ? "Release to send" : canRecord ? "Hold to speak" : "Wait until the customer finishes"
            }
            className={`
              flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all lg:h-14 lg:w-14
              ${isRecording
                ? "scale-105 bg-red-600 text-white shadow-lg shadow-red-600/30 ring-2 ring-red-400/50"
                : canRecord
                  ? "bg-brand-gradient text-white shadow-glow-sm ring-1 ring-white/20 hover:scale-105 hover:brightness-110 active:brightness-95"
                  : "cursor-not-allowed bg-zinc-800 text-zinc-600"
              }
            `}
          >
            {isRecording ? (
              <svg className="h-6 w-6 lg:h-7 lg:w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg className="h-6 w-6 lg:h-7 lg:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-16a3 3 0 00-3 3v4a3 3 0 006 0V8a3 3 0 00-3-3z" />
              </svg>
            )}
          </button>
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-600"
            aria-hidden
            title="More options coming soon"
          >
            <IconPlus className="h-6 w-6" />
          </span>
        </div>
      </div>
    </div>
  );
}
