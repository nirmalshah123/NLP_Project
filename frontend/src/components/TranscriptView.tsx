interface Props {
  transcript: string;
  mistakes: string[];
}

export default function TranscriptView({ transcript, mistakes }: Props) {
  const lines = transcript.split("\n").filter((l) => l.trim());

  const mistakeQuotes = mistakes
    .map((m) => {
      const match = m.match(/'([^']+)'/);
      return match ? match[1].toLowerCase() : "";
    })
    .filter(Boolean);

  function isHighlighted(line: string) {
    const lower = line.toLowerCase();
    return mistakeQuotes.some((q) => lower.includes(q));
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-100 mb-4">Call Transcript</h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {lines.map((line, i) => {
          const isCustomer = line.startsWith("CUSTOMER:");
          const isRep = line.startsWith("REPRESENTATIVE:");
          const highlighted = isHighlighted(line);

          return (
            <div
              key={i}
              className={`px-3 py-2 rounded-lg text-sm ${
                highlighted
                  ? "bg-red-900/40 border border-red-800"
                  : isCustomer
                    ? "bg-gray-800"
                    : isRep
                      ? "bg-indigo-900/30"
                      : "bg-gray-800/50"
              }`}
            >
              {isCustomer && (
                <span className="text-[10px] font-bold uppercase text-gray-500 mr-2">Customer</span>
              )}
              {isRep && (
                <span className="text-[10px] font-bold uppercase text-indigo-400 mr-2">Representative</span>
              )}
              <span className="text-gray-300">
                {line.replace(/^(CUSTOMER|REPRESENTATIVE):\s*/, "")}
              </span>
              {highlighted && (
                <span className="ml-2 text-[10px] text-red-400 font-medium">MISTAKE</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
