export function createCallSocket(callId: number) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/api/calls/ws/${callId}`);
  ws.binaryType = "arraybuffer";
  return ws;
}
