import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

interface Props {
  empathy: number;
  de_escalation: number;
  policy_adherence: number;
  professionalism: number;
  resolution: number;
}

export default function ScoreCard(props: Props) {
  const data = [
    { metric: "Empathy", value: props.empathy },
    { metric: "De-escalation", value: props.de_escalation },
    { metric: "Policy", value: props.policy_adherence },
    { metric: "Professionalism", value: props.professionalism },
    { metric: "Resolution", value: props.resolution },
  ];

  const avg = data.reduce((s, d) => s + d.value, 0) / data.length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-100">Performance Scores</h3>
        <span className="text-2xl font-bold text-indigo-400">{avg.toFixed(1)}/10</span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data}>
          <PolarGrid stroke="#374151" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: "#9ca3af", fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={{ fill: "#6b7280", fontSize: 10 }} />
          <Radar dataKey="value" stroke="#818cf8" fill="#818cf8" fillOpacity={0.25} />
        </RadarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-5 gap-2 mt-4">
        {data.map((d) => (
          <div key={d.metric} className="text-center">
            <p className="text-xs text-gray-500">{d.metric}</p>
            <p className="text-lg font-semibold text-gray-200">{d.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
