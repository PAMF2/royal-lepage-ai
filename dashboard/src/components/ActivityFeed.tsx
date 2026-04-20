"use client";
import { useEffect, useState } from "react";

interface Activity {
  id: string;
  contactName: string;
  action: string;
  stage: string;
  timestamp: string;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => setActivities(d.activities ?? []));
  }, []);

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Recent Activity</h2>
      {activities.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          No recent activity
        </p>
      ) : (
        <ul className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-[#C8102E] mt-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{a.contactName}</span> —{" "}
                  {a.action}
                </p>
                <p className="text-xs text-gray-400">
                  {a.stage} · {new Date(a.timestamp).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
