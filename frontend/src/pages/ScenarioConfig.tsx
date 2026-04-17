import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Scenario } from "../lib/api";

const PERSONA_OPTIONS = ["Rude", "Impatient", "Passive-Aggressive", "Confused"];

function truncateUrl(url: string, max = 48) {
  if (url.length <= max) return url;
  return `${url.slice(0, max)}...`;
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function ScenarioConfig() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [personaType, setPersonaType] = useState(PERSONA_OPTIONS[0]);
  const [objective, setObjective] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [difficulty, setDifficulty] = useState(5);

  useEffect(() => {
    api.listScenarios().then(setScenarios).catch(console.error);
  }, []);

  const filteredScenarios = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scenarios;
    return scenarios.filter((s) => {
      const hay = `${s.objective} ${s.persona_type} ${s.target_url}`.toLowerCase();
      return hay.includes(q);
    });
  }, [scenarios, search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const s = await api.createScenario({
        persona_type: personaType,
        objective,
        target_url: targetUrl,
        difficulty,
      });
      setScenarios((prev) => [s, ...prev]);
      setObjective("");
      setTargetUrl("");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    await api.deleteScenario(id);
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleStartCall(scenarioId: number) {
    const call = await api.startCall(scenarioId);
    navigate(`/call/${call.id}?scenarioId=${scenarioId}`);
  }

  return (
    <div className="relative pb-8">
      <div className="relative space-y-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start lg:gap-10">
          {/* Left: controls */}
          <div className="space-y-4 lg:col-span-5">
            <section className="glass-strong p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">New scenario</h2>
                <p className="mt-1 text-sm text-zinc-400">Training controls</p>
              </div>

              <form onSubmit={handleCreate} className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="persona" className="mb-1.5 block text-sm font-medium text-zinc-300">
                      Persona type
                    </label>
                    <select
                      id="persona"
                      value={personaType}
                      onChange={(e) => setPersonaType(e.target.value)}
                      className="select-glass font-medium"
                    >
                      {PERSONA_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <label htmlFor="difficulty" className="text-sm font-medium text-zinc-300">
                        Difficulty
                      </label>
                      <span className="rounded-lg bg-white/10 px-2.5 py-0.5 font-mono text-sm font-semibold tabular-nums text-fuchsia-200 ring-1 ring-white/10">
                        {difficulty}
                        <span className="text-zinc-500">/10</span>
                      </span>
                    </div>
                    <input
                      id="difficulty"
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={difficulty}
                      onChange={(e) => setDifficulty(Number(e.target.value))}
                      className="slider-brand w-full"
                      aria-valuemin={1}
                      aria-valuemax={10}
                      aria-valuenow={difficulty}
                      aria-label={`Difficulty ${difficulty} out of 10`}
                    />
                    <div className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                      <span>Easier</span>
                      <span>Harder</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="objective" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Objective
                  </label>
                  <input
                    id="objective"
                    type="text"
                    required
                    placeholder="e.g. Order a large pepperoni pizza to Salesforce Tower"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    className="input-glass"
                  />
                </div>

                <div>
                  <label htmlFor="targetUrl" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Target URL (context)
                  </label>
                  <input
                    id="targetUrl"
                    type="url"
                    required
                    placeholder="https://www.example.com/order/"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="input-glass"
                  />
                </div>

                <button type="submit" disabled={loading} className="btn-accent-orange">
                  {loading ? "Creating..." : "Create scenario"}
                </button>
              </form>
            </section>

            <section className="glass-strong p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-white">Quick tips</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Match difficulty to your comfort level. Use a real target URL so context scraping matches your training
                goal.
              </p>
            </section>
          </div>

          {/* Right: scenarios */}
          <div className="lg:col-span-7">
            <div className="sticky top-4 flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Saved scenarios</h2>
                  <p className="mt-1 text-sm text-zinc-400">Select one to start a call.</p>
                </div>
                <div className="w-full sm:max-w-xs">
                  <label htmlFor="scenario-search" className="sr-only">
                    Filter scenarios
                  </label>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                      aria-hidden
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      id="scenario-search"
                      type="text"
                      role="searchbox"
                      placeholder="Search..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="input-glass pl-10"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>

              <div className="max-h-[min(70vh,calc(100vh-10rem))] space-y-3 overflow-y-auto pr-1">
                {scenarios.length === 0 ? (
                  <div className="glass-strong px-6 py-14 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                      <svg className="h-7 w-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                    </div>
                    <p className="text-zinc-400">No scenarios yet. Create one on the left.</p>
                  </div>
                ) : filteredScenarios.length === 0 ? (
                  <div className="glass-strong px-6 py-14 text-center">
                    <p className="text-zinc-400">No scenarios match your search.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {filteredScenarios.map((s) => (
                      <li key={s.id}>
                        <div className="glass-strong flex flex-col gap-4 border-l-[3px] border-l-fuchsia-500/70 p-4 sm:flex-row sm:items-center sm:gap-3 sm:p-5">
                          <div className="min-w-0 flex-1 pl-1">
                            <p className="font-semibold leading-snug text-white">{s.objective}</p>
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
                              <span className="rounded-full bg-white/10 px-2 py-0.5 font-medium text-fuchsia-200/95 ring-1 ring-white/10">
                                {s.persona_type}
                              </span>
                              <span className="text-zinc-600" aria-hidden>
                                ·
                              </span>
                              <span>Difficulty {s.difficulty}/10</span>
                              <span className="text-zinc-600" aria-hidden>
                                ·
                              </span>
                              <span className="break-all text-zinc-500">{truncateUrl(s.target_url)}</span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 sm:pl-2">
                            <button
                              type="button"
                              onClick={() => handleStartCall(s.id)}
                              className="btn-brand min-h-[44px] flex-1 px-6 py-2.5 text-sm font-semibold sm:flex-none sm:min-w-[8.5rem]"
                            >
                              Start call
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(s.id)}
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-sm font-medium text-zinc-300 transition hover:bg-red-950/40 hover:text-red-200"
                              aria-label={`Delete scenario: ${s.objective}`}
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                            <span className="hidden text-zinc-600 sm:flex" aria-hidden>
                              <ChevronRight className="h-5 w-5" />
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

