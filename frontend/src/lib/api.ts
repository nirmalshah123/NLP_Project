const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export interface Scenario {
  id: number;
  persona_type: string;
  objective: string;
  target_url: string;
  difficulty: number;
  created_at: string;
}

export interface Call {
  id: number;
  scenario_id: number;
  status: string;
  started_at: string;
  ended_at: string | null;
}

export interface Evaluation {
  id: number;
  call_id: number;
  empathy: number;
  de_escalation: number;
  policy_adherence: number;
  professionalism: number;
  resolution: number;
  mistakes: string;
  coaching: string;
  transcript: string;
}

export const api = {
  listScenarios: () => request<Scenario[]>("/scenarios"),
  createScenario: (data: Omit<Scenario, "id" | "created_at">) =>
    request<Scenario>("/scenarios", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getScenario: (id: number) => request<Scenario>(`/scenarios/${id}`),
  deleteScenario: (id: number) =>
    request<void>(`/scenarios/${id}`, { method: "DELETE" }),

  startCall: (scenarioId: number) =>
    request<Call>(`/calls/start/${scenarioId}`, { method: "POST" }),
  endCall: (callId: number) =>
    request<Call>(`/calls/end/${callId}`, { method: "POST" }),

  getReport: (callId: number) => request<Evaluation>(`/reports/${callId}`),
};
