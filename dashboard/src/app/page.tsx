import PipelineStats from "@/components/PipelineStats";
import RecentLeads from "@/components/RecentLeads";
import ConversionChart from "@/components/ConversionChart";
import ActivityFeed from "@/components/ActivityFeed";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Homie Dashboard</h1>
          <p className="text-sm text-gray-500">
            Royal LePage — AI Lead Management
          </p>
        </div>
        <div className="text-xs text-gray-400">
          Last updated: {new Date().toLocaleString()}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <PipelineStats />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ConversionChart />
          <ActivityFeed />
        </div>

        <RecentLeads />
      </div>
    </main>
  );
}
