'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ProtectedRoute } from "@/lib/auth-context";
import { apiClient, Import, Stats, Run } from "@/lib/api-client";
import { useAlert } from "@/lib/alert-context";
import AppHeader from "@/components/AppHeader";

export default function Dashboard() {
  const router = useRouter();
  const { organization, user } = useAuth();
  const alert = useAlert();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentRuns, setRecentRuns] = useState<Run[]>([]);
  const [recentImports, setRecentImports] = useState<Import[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!organization) return;

    try {
      setIsLoading(true);
      const [statsData, runsData, importsData] = await Promise.all([
        apiClient.getStats(organization.organizationId),
        apiClient.getRuns(organization.organizationId),
        apiClient.getImports(organization.organizationId),
      ]);
      setStats(statsData);
      setRecentRuns(runsData.slice(-3).reverse()); // Last 3 runs, most recent first
      setRecentImports(importsData.slice(0, 5));
    } catch (err: any) {
      console.error('[Dashboard] Failed to load data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [organization]);

  // Refresh when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && organization) {
        loadData();
      }
    };

    const handleFocus = () => {
      if (organization) {
        loadData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [organization]);

  if (isLoading) {
    return (
      <ProtectedRoute>
        <main className="min-h-screen p-8 bg-[#131313]">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#41ffaf] mx-auto"></div>
              <p className="mt-4 text-[#bacbbe]">Loading dashboard...</p>
            </div>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute>
        <main className="min-h-screen p-8 bg-[#131313]">
          <div className="max-w-7xl mx-auto">
            <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl">
              <h2 className="text-lg font-semibold text-red-400 mb-2 headline-font">
                Failed to load dashboard
              </h2>
              <p className="text-red-400">{error}</p>
            </div>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/30';
      case 'running':
      case 'queued':
        return 'bg-[#41ffaf]/10 text-[#41ffaf] border border-[#41ffaf]/30';
      case 'failed':
        return 'bg-red-500/10 text-red-400 border border-red-500/30';
      case 'needs_review':
        return 'bg-orange-500/10 text-orange-400 border border-orange-500/30';
      default:
        return 'bg-[#353535] text-[#bacbbe] border border-white/10';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Ready to Deploy';
      case 'running':
        return 'Analyzing';
      case 'queued':
        return 'Queued';
      case 'failed':
        return 'Failed';
      case 'needs_review':
        return 'Needs Review';
      default:
        return status.replace('_', ' ');
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
        <AppHeader />

        <main className="p-8">
          <div className="max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2 text-white headline-font">Dashboard</h1>
              <p className="text-[#bacbbe]">
                Your tag migrations
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="p-6 bg-[#20201f] border border-white/10 rounded-xl shadow-lg">
                <p className="text-sm text-[#bacbbe] mb-1 label-font">Total Imports</p>
                <p className="text-3xl font-bold text-white headline-font">{stats?.totalImports || 0}</p>
              </div>

              <div className="p-6 bg-[#20201f] border border-white/10 rounded-xl shadow-lg">
                <p className="text-sm text-[#bacbbe] mb-1 label-font">Migrations</p>
                <p className="text-3xl font-bold text-white headline-font">{stats?.totalRuns || 0}</p>
              </div>

              <div className="p-6 bg-[#20201f] border border-white/10 rounded-xl shadow-lg">
                <p className="text-sm text-[#bacbbe] mb-1 label-font">Success Rate</p>
                <p className="text-3xl font-bold text-white headline-font">{stats?.successRate.toFixed(1) || 0}%</p>
              </div>

              <div className="p-6 bg-[#20201f] border border-white/10 rounded-xl shadow-lg">
                <p className="text-sm text-[#bacbbe] mb-1 label-font">Last Run</p>
                <p className="text-sm font-semibold text-white">
                  {stats?.lastRun ? new Date(stats.lastRun).toLocaleDateString() : 'No runs yet'}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-[#20201f] border border-white/10 rounded-xl shadow-lg p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4 text-white headline-font">Quick Actions</h2>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/import"
                  className="px-6 py-3 bg-[#41ffaf] text-[#003822] rounded-xl font-semibold label-font hover:opacity-90 transition-all"
                >
                  Import GTM Container
                </Link>
                <Link
                  href="/imports"
                  className="px-6 py-3 border border-white/10 text-white rounded-xl hover:bg-white/5 transition-colors label-font"
                >
                  View Imports
                </Link>
                <Link
                  href="/migrations"
                  className="px-6 py-3 border border-white/10 text-white rounded-xl hover:bg-white/5 transition-colors label-font"
                >
                  View Migrations
                </Link>
              </div>
            </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#20201f] border border-white/10 rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-white headline-font">Recent Imports</h2>
              {recentImports.length === 0 ? (
                <p className="text-[#bacbbe] text-center py-8">No imports yet. Import a GTM container to get started.</p>
              ) : (
                <div className="space-y-3">
                  {recentImports.map((imp) => (
                    <div key={imp.importId} className="flex items-center justify-between p-4 border border-white/10 rounded-xl hover:bg-[#2a2a2a] transition-colors">
                      <div className="flex-1">
                        <p className="font-semibold text-white">{imp.projectId || 'Imported container'}</p>
                        <p className="text-sm text-[#bacbbe]">{new Date(imp.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 rounded-xl text-sm label-font bg-[#41ffaf]/10 text-[#41ffaf] border border-[#41ffaf]/30">
                          {imp.status}
                        </span>
                        <button
                          onClick={async () => {
                            try {
                              console.log('Creating migration for import:', imp.importId);
                              const run = await apiClient.createRun(imp.importId);
                              console.log('Migration created:', run);
                              router.push(`/migrations/${run.runId}`);
                            } catch (err: any) {
                              console.error('Failed to create migration:', err);
                              alert.error(`Failed to create migration: ${err.message}`);
                            }
                          }}
                          className="px-4 py-2 bg-[#41ffaf] text-[#003822] rounded-lg text-sm font-semibold label-font hover:opacity-90 transition-all"
                        >
                          Create Migration
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#20201f] border border-white/10 rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-white headline-font">Recent Migrations</h2>
            {recentRuns.length === 0 ? (
              <p className="text-[#bacbbe] text-center py-8">No migrations yet. Create your first migration above!</p>
            ) : (
              <div className="space-y-4">
                {recentRuns.map((run) => (
                  <Link
                    key={run.runId}
                    href={`/migrations/${run.runId}`}
                    className="flex items-center justify-between p-4 border border-white/10 rounded-xl hover:bg-[#2a2a2a] transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-white">Migration Run {run.runId.slice(0, 8)}</p>
                      <p className="text-sm text-[#bacbbe]">
                        {formatRelativeTime(run.createdAt)}
                        {run.confidenceScore && ` • ${run.confidenceScore.toFixed(1)}% confidence`}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-xl text-sm label-font ${getStatusColor(run.status)}`}>
                      {getStatusLabel(run.status)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          </div>

          {/* User Info */}
          <div className="mt-8 text-center text-sm text-[#bacbbe]/60">
            <p>👤 Logged in as {user?.email}</p>
          </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
