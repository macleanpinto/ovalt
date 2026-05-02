'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ProtectedRoute } from "@/lib/auth-context";
import { apiClient, Import, Stats, Run } from "@/lib/api-client";
import { useAlert } from "@/lib/alert-context";
import AppHeader from "@/components/AppHeader";
import { RampMain, RampPageHero, RampPanel } from "@/components/ramp-shell";

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
        <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
          <AppHeader />
          <RampMain>
            <div className="flex min-h-[50vh] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[#41ffaf] border-t-transparent" />
                <p className="mt-4 text-zinc-400">Loading dashboard…</p>
              </div>
            </div>
          </RampMain>
        </div>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
          <AppHeader />
          <RampMain>
            <RampPanel padding="p-6" className="border-red-500/20 bg-red-500/5">
              <h2 className="mb-2 text-lg font-semibold text-red-300 headline-font">Failed to load dashboard</h2>
              <p className="text-red-400/90">{error}</p>
            </RampPanel>
          </RampMain>
        </div>
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

        <RampMain>
          <RampPageHero
            eyebrow="Workspace"
            title="Dashboard"
            description="Monitor imports, migration runs, and continue server-side rollout from one place."
          />

          {/* Stats — Ramp-like metric tiles */}
          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <RampPanel padding="p-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Total imports</p>
              <p className="text-3xl font-semibold tracking-tight text-white">{stats?.totalImports || 0}</p>
            </RampPanel>
            <RampPanel padding="p-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Migrations</p>
              <p className="text-3xl font-semibold tracking-tight text-white">{stats?.totalRuns || 0}</p>
            </RampPanel>
            <RampPanel padding="p-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Success rate</p>
              <p className="text-3xl font-semibold tracking-tight text-white">{stats?.successRate.toFixed(1) || 0}%</p>
            </RampPanel>
            <RampPanel padding="p-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Last run</p>
              <p className="text-sm font-semibold text-white">
                {stats?.lastRun ? new Date(stats.lastRun).toLocaleDateString() : 'No runs yet'}
              </p>
            </RampPanel>
          </div>

          <RampPanel padding="p-6 md:p-8" className="mb-10">
            <h2 className="mb-6 text-lg font-semibold text-white">Quick actions</h2>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/import"
                className="rounded-full bg-[#41ffaf] px-6 py-3 text-sm font-semibold text-[#003822] transition-opacity hover:opacity-90"
              >
                Import GTM container
              </Link>
              <Link
                href="/imports"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                View imports
              </Link>
              <Link
                href="/migrations"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                View migrations
              </Link>
            </div>
          </RampPanel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RampPanel padding="p-6 md:p-8">
              <h2 className="mb-4 text-lg font-semibold text-white">Recent imports</h2>
              {recentImports.length === 0 ? (
                <p className="text-[#bacbbe] text-center py-8">No imports yet. Import a GTM container to get started.</p>
              ) : (
                <div className="space-y-3">
                  {recentImports.map((imp) => (
                    <div
                      key={imp.importId}
                      className="flex items-center justify-between rounded-xl border border-white/[0.06] p-4 transition-colors hover:bg-white/[0.03]"
                    >
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
                          className="rounded-full bg-[#41ffaf] px-4 py-2 text-sm font-semibold text-[#003822] transition-opacity hover:opacity-90"
                        >
                          Create Migration
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </RampPanel>

            <RampPanel padding="p-6 md:p-8">
              <h2 className="mb-4 text-lg font-semibold text-white">Recent migrations</h2>
            {recentRuns.length === 0 ? (
              <p className="text-[#bacbbe] text-center py-8">No migrations yet. Create your first migration above!</p>
            ) : (
              <div className="space-y-4">
                {recentRuns.map((run) => (
                  <Link
                    key={run.runId}
                    href={`/migrations/${run.runId}`}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] p-4 transition-colors hover:bg-white/[0.03]"
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
            </RampPanel>
          </div>

          <p className="mt-10 text-center text-sm text-zinc-600">Signed in as {user?.email}</p>
        </RampMain>
      </div>
    </ProtectedRoute>
  );
}
