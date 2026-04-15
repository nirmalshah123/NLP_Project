import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ScoreCard from "../components/ScoreCard";
import TranscriptView from "../components/TranscriptView";
import { api, Evaluation } from "../lib/api";

export default function Report() {
  const { callId } = useParams();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!callId) return;
    setLoading(true);
    api
      .getReport(Number(callId))
      .then(setEvaluation)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [callId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 animate-pulse text-lg">
          Generating evaluation report...
        </div>
      </div>
    );
  }

  if (error || !evaluation) {
    return (
      <div className="text-center mt-12">
        <p className="text-red-400">{error || "Report not found"}</p>
        <Link to="/" className="text-indigo-400 underline mt-4 inline-block">
          Back to scenarios
        </Link>
      </div>
    );
  }

  let mistakes: string[] = [];
  try {
    mistakes = JSON.parse(evaluation.mistakes);
  } catch {
    mistakes = evaluation.mistakes ? [evaluation.mistakes] : [];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Call Report</h2>
        <Link to="/" className="text-sm text-indigo-400 hover:underline">
          Back to scenarios
        </Link>
      </div>

      <ScoreCard
        empathy={evaluation.empathy}
        de_escalation={evaluation.de_escalation}
        policy_adherence={evaluation.policy_adherence}
        professionalism={evaluation.professionalism}
        resolution={evaluation.resolution}
      />

      {/* Mistakes */}
      {mistakes.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-3">Mistakes Identified</h3>
          <ul className="space-y-2">
            {mistakes.map((m, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-gray-300"
              >
                <span className="text-red-500 mt-0.5 shrink-0">&#x2022;</span>
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Coaching */}
      {evaluation.coaching && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-green-400 mb-3">Coaching Tips</h3>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {evaluation.coaching}
          </p>
        </div>
      )}

      {/* Transcript */}
      {evaluation.transcript && (
        <TranscriptView transcript={evaluation.transcript} mistakes={mistakes} />
      )}
    </div>
  );
}
