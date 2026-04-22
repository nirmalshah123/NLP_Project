export function createCallSocket(callId: number) {
  const rawBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  if (rawBase) {
    const wsBase = rawBase.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const ws = new WebSocket(`${wsBase}/api/calls/ws/${callId}`);
    ws.binaryType = "arraybuffer";
    return ws;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/api/calls/ws/${callId}`);
  ws.binaryType = "arraybuffer";
  return ws;
}
