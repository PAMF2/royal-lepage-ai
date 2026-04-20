"use client";
import { useEffect, useState } from "react";

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  source: string;
  tags: string[];
  dateAdded: string;
  score?: number;
}

const STAGE_COLORS: Record<string, string> = {
  "hot-lead": "bg-red-100 text-red-700",
  "warm-lead": "bg-orange-100 text-orange-700",
  "cold-lead": "bg-blue-100 text-blue-700",
  "pre-approved": "bg-green-100 text-green-700",
  "appointment-set": "bg-purple-100 text-purple-700",
  buyer: "bg-gray-100 text-gray-700",
  seller: "bg-yellow-100 text-yellow-700",
};

export default function RecentLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []));
  }, []);

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Recent Leads</h2>
        <span className="text-xs text-gray-400">{leads.length} shown</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-6 py-3 text-left">Name</th>
              <th className="px-6 py-3 text-left">Contact</th>
              <th className="px-6 py-3 text-left">Source</th>
              <th className="px-6 py-3 text-left">Tags</th>
              <th className="px-6 py-3 text-left">Score</th>
              <th className="px-6 py-3 text-left">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">
                  {l.firstName} {l.lastName}
                </td>
                <td className="px-6 py-3 text-gray-500">
                  <div>{l.phone}</div>
                  <div className="text-xs">{l.email}</div>
                </td>
                <td className="px-6 py-3 text-gray-500">{l.source}</td>
                <td className="px-6 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(l.tags ?? []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className={`text-xs px-2 py-0.5 rounded-full ${STAGE_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-3">
                  {l.score !== undefined ? (
                    <span
                      className={`font-bold ${l.score >= 70 ? "text-green-600" : l.score >= 40 ? "text-orange-500" : "text-gray-400"}`}
                    >
                      {l.score}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-6 py-3 text-gray-400 text-xs">
                  {new Date(l.dateAdded).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">
            No leads yet
          </p>
        )}
      </div>
    </div>
  );
}
