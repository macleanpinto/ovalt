'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute, useAuth } from '@/lib/auth-context';
import { apiClient, Run } from '@/lib/api-client';
import { useAlert } from '@/lib/alert-context';
import AppHeader from '@/components/AppHeader';
import { RampMain, RampPageHero, RampPanel } from '@/components/ramp-shell';

export default function MigrationsPage() {
  const router = useRouter();
  const { organization } = useAuth();
  const alert = useAlert();
  const [runs, setRuns] = useState<Run[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = async () => {
    if (!organization) return;

    try {
      setIsLoading(true);
      const runsData = await apiClient.getRuns(organization.organizationId);
      setRuns(runsData);
    } catch (err: any) {
      console.error('[Migrations] Failed to load runs:', err);
      setError(err.message || 'Failed to load migrations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, [organization]);

  // Refresh when page becomes visible (e.g., navigating back from migration detail)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && organization) {
        loadRuns();
      }
    };

    const handleFocus = () => {
      if (organization) {
        loadRuns();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [organization]);

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
        return 'READY TO DEPLOY';
      case 'running':
        return 'ANALYZING';
      case 'queued':
        return 'QUEUED';
      case 'failed':
        return 'FAILED';
      case 'needs_review':
        return 'NEEDS REVIEW';
      default:
        return status.replace('_', ' ').toUpperCase();
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
            eyebrow="Migrations"
            title="All runs"
            description="Open a run to review mappings and deploy to your server-side container."
            actions={
              <div className="flex flex-wrap gap-2">
                {runs.length > 0 ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Delete all ${runs.length} migration(s)?\n\nThis cannot be undone.`)) {
                        return;
                      }
                      try {
                        await Promise.all(runs.map((run) => apiClient.deleteRun(run.runId)));
                        setRuns([]);
                        alert.success('All migrations deleted');
                      } catch (err: any) {
                        alert.error(`Failed to delete some migrations: ${err.message}`);
                      }
                    }}
                    className="rounded-full border border-red-500/35 bg-red-500/10 px-5 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
                  >
                    Delete all
                  </button>
                ) : null}
                <Link
                  href="/dashboard"
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/5"
                >
                  Back to dashboard
                </Link>
              </div>
            }
          />

          {isLoading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#41ffaf] mx-auto"></div>
                <p className="mt-4 text-[#bacbbe]">Loading migrations...</p>
              </div>
            </div>
          ) : error ? (
            <RampPanel padding="p-6" className="border-red-500/25 bg-red-500/5">
              <h2 className="mb-2 text-lg font-semibold text-red-300">Failed to load migrations</h2>
              <p className="text-red-400/90">{error}</p>
            </RampPanel>
          ) : runs.length === 0 ? (
            <RampPanel padding="p-12 md:p-16" className="text-center">
              <svg className="w-16 h-16 text-white/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="text-xl font-bold text-white mb-2 headline-font">No Migrations Yet</h3>
              <p className="text-[#bacbbe] mb-6">
                Import a GTM container first, then create a migration run.
              </p>
              <Link
                href="/import"
                className="inline-block rounded-full bg-[#41ffaf] px-8 py-3 text-sm font-semibold text-[#003822] transition-opacity hover:opacity-90"
              >
                Import container
              </Link>
            </RampPanel>
          ) : (
            <RampPanel padding="p-0" className="overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 border-b border-white/[0.08] bg-white/[0.03] px-6 py-4">
                <div className="col-span-4 font-label text-xs uppercase tracking-widest text-white/50">
                  Run ID
                </div>
                <div className="col-span-4 font-label text-xs uppercase tracking-widest text-white/50">
                  Import ID
                </div>
                <div className="col-span-2 font-label text-xs uppercase tracking-widest text-white/50">
                  Status
                </div>
                <div className="col-span-1 font-label text-xs uppercase tracking-widest text-white/50 text-right">
                  Created
                </div>
                <div className="col-span-1 font-label text-xs uppercase tracking-widest text-white/50 text-right">
                  Actions
                </div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-white/[0.06]">
                {runs.map((run) => (
                  <div
                    key={run.runId}
                    className="grid grid-cols-12 items-center px-6 py-5 transition-colors hover:bg-white/[0.03]"
                  >
                    <Link href={`/migrations/${run.runId}`} className="col-span-4">
                      <code className="text-sm text-white font-mono hover:text-[#41ffaf]">{run.runId.slice(0, 12)}...</code>
                    </Link>
                    <div className="col-span-4">
                      <code className="text-sm text-white/60 font-mono">{run.importId?.slice(0, 12)}...</code>
                    </div>
                    <div className="col-span-2">
                      <span className={`inline-block px-3 py-1 rounded-xl text-xs font-semibold label-font ${getStatusColor(run.status)}`}>
                        {getStatusLabel(run.status)}
                      </span>
                    </div>
                    <div className="col-span-1 text-right text-[#bacbbe] text-sm">
                      {formatRelativeTime(run.createdAt)}
                    </div>
                    <div className="col-span-1 text-right">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Delete migration ${run.runId.slice(0, 8)}...?\n\nThis cannot be undone.`)) {
                            return;
                          }

                          try {
                            await apiClient.deleteRun(run.runId);
                            setRuns(runs.filter(r => r.runId !== run.runId));
                            alert.success('Migration deleted');
                          } catch (err: any) {
                            alert.error(`Failed to delete: ${err.message}`);
                          }
                        }}
                        className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-all border border-red-500/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </RampPanel>
          )}
        </RampMain>
      </div>
    </ProtectedRoute>
  );
}
