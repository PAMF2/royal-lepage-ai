"use client";
import { useEffect, useState } from "react";

interface Stats {
  totalLeads: number;
  conversionRate: string;
  qualificationRate: string;
  appointmentsSet: number;
  handedOff: number;
  stageCounts: Record<string, number>;
}

export default function PipelineStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  const cards = [
    { label: "Total Leads", value: stats?.totalLeads?.toLocaleString() ?? "—" },
    {
      label: "Appointments Set",
      value: stats?.appointmentsSet?.toLocaleString() ?? "—",
    },
    {
      label: "Conversion Rate",
      value: stats ? `${stats.conversionRate}%` : "—",
    },
    {
      label: "Qualification Rate",
      value: stats ? `${stats.qualificationRate}%` : "—",
    },
    {
      label: "Handed Off to Agents",
      value: stats?.handedOff?.toLocaleString() ?? "—",
    },
    {
      label: "In Nurture",
      value: stats?.stageCounts?.["Nurture"]?.toLocaleString() ?? "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white rounded-lg border p-4 text-center"
        >
          <p className="text-2xl font-bold text-gray-900">{c.value}</p>
          <p className="text-xs text-gray-500 mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
