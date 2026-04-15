import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Scenario } from "../lib/api";

const PERSONA_OPTIONS = ["Rude", "Impatient", "Passive-Aggressive", "Confused"];

export default function ScenarioConfig() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(false);

  const [personaType, setPersonaType] = useState(PERSONA_OPTIONS[0]);
  const [objective, setObjective] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [difficulty, setDifficulty] = useState(5);

  useEffect(() => {
    api.listScenarios().then(setScenarios).catch(console.error);
  }, []);

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
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold mb-4">Create Training Scenario</h2>
        <form onSubmit={handleCreate} className="bg-gray-900 rounded-xl p-6 space-y-4 border border-gray-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Persona Type</label>
              <select
                value={personaType}
                onChange={(e) => setPersonaType(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PERSONA_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Difficulty ({difficulty}/10)
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Objective</label>
            <input
              type="text"
              required
              placeholder='e.g. "Order a large pepperoni pizza to Salesforce Tower"'
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Target URL (for context scraping)</label>
            <input
              type="url"
              required
              placeholder="https://www.dominos.com/pages/order/"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg px-6 py-2 transition"
          >
            {loading ? "Creating..." : "Create Scenario"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Saved Scenarios</h2>
        {scenarios.length === 0 ? (
          <p className="text-gray-500">No scenarios yet. Create one above.</p>
        ) : (
          <div className="space-y-3">
            {scenarios.map((s) => (
              <div
                key={s.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-100">
                    <span className="inline-block bg-indigo-900/60 text-indigo-300 text-xs px-2 py-0.5 rounded-full mr-2">
                      {s.persona_type}
                    </span>
                    {s.objective}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Difficulty: {s.difficulty}/10 &middot; {s.target_url}
                  </p>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => handleStartCall(s.id)}
                    className="bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg px-4 py-1.5 transition"
                  >
                    Start Call
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="bg-red-900/60 hover:bg-red-800 text-red-300 text-sm rounded-lg px-3 py-1.5 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
