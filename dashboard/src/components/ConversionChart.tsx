"use client";
import { useEffect, useState } from "react";

const STAGES = [
  "New Lead",
  "Attempted Contact",
  "Contacted",
  "Qualified",
  "Appointment Set",
  "Handed Off",
];

export default function ConversionChart() {
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStageCounts(d.stageCounts ?? {}));
  }, []);

  const max = Math.max(...STAGES.map((s) => stageCounts[s] ?? 0), 1);

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Pipeline Funnel</h2>
      <div className="space-y-3">
        {STAGES.map((stage) => {
          const count = stageCounts[stage] ?? 0;
          const pct = Math.round((count / max) * 100);
          return (
            <div key={stage}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{stage}</span>
                <span className="font-medium text-gray-900">
                  {count.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-[#C8102E] h-2 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
