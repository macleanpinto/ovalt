'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute, useAuth } from '@/lib/auth-context';
import { apiClient, Run } from '@/lib/api-client';
import { useAlert } from '@/lib/alert-context';
import AppHeader from '@/components/AppHeader';

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

        <main className="p-8">
          <div className="max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2 text-white headline-font">Migrations</h1>
                <p className="text-[#bacbbe]">
                  View all your migration runs
                </p>
              </div>
              <div className="flex gap-3">
                {runs.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete all ${runs.length} migration(s)?\n\nThis cannot be undone.`)) {
                        return;
                      }
                      try {
                        await Promise.all(runs.map(run => apiClient.deleteRun(run.runId)));
                        setRuns([]);
                        alert.success('All migrations deleted');
                      } catch (err: any) {
                        alert.error(`Failed to delete some migrations: ${err.message}`);
                      }
                    }}
                    className="px-6 py-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors label-font border border-red-500/30"
                  >
                    Delete All
                  </button>
                )}
                <Link
                  href="/dashboard"
                  className="px-6 py-3 border border-white/10 text-white rounded-xl hover:bg-white/5 transition-colors label-font"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>

          {isLoading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#41ffaf] mx-auto"></div>
                <p className="mt-4 text-[#bacbbe]">Loading migrations...</p>
              </div>
            </div>
          ) : error ? (
            <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl">
              <h2 className="text-lg font-semibold text-red-400 mb-2 headline-font">
                Failed to load migrations
              </h2>
              <p className="text-red-400">{error}</p>
            </div>
          ) : runs.length === 0 ? (
            <div className="bg-[#20201f] border border-white/10 rounded-xl p-12 text-center">
              <svg className="w-16 h-16 text-white/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="text-xl font-bold text-white mb-2 headline-font">No Migrations Yet</h3>
              <p className="text-[#bacbbe] mb-6">
                Import a GTM container first, then create a migration run.
              </p>
              <Link
                href="/import"
                className="inline-block px-6 py-3 bg-[#41ffaf] text-[#003822] rounded-xl font-semibold label-font hover:opacity-90 transition-all"
              >
                Import Container
              </Link>
            </div>
          ) : (
            <div className="bg-[#20201f] border border-white/10 rounded-xl shadow-lg overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 bg-[#353535]/50 px-6 py-4 border-b border-white/10">
                <div className="col-span-3 font-label text-xs uppercase tracking-widest text-white/50">
                  Run ID
                </div>
                <div className="col-span-3 font-label text-xs uppercase tracking-widest text-white/50">
                  Import ID
                </div>
                <div className="col-span-2 font-label text-xs uppercase tracking-widest text-white/50">
                  Status
                </div>
                <div className="col-span-2 font-label text-xs uppercase tracking-widest text-white/50 text-right">
                  Confidence
                </div>
                <div className="col-span-1 font-label text-xs uppercase tracking-widest text-white/50 text-right">
                  Created
                </div>
                <div className="col-span-1 font-label text-xs uppercase tracking-widest text-white/50 text-right">
                  Actions
                </div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-white/5">
                {runs.map((run) => (
                  <div
                    key={run.runId}
                    className="grid grid-cols-12 px-6 py-5 hover:bg-[#2a2a2a] transition-colors items-center"
                  >
                    <Link href={`/migrations/${run.runId}`} className="col-span-3">
                      <code className="text-sm text-white font-mono hover:text-[#41ffaf]">{run.runId.slice(0, 12)}...</code>
                    </Link>
                    <div className="col-span-3">
                      <code className="text-sm text-white/60 font-mono">{run.importId?.slice(0, 12)}...</code>
                    </div>
                    <div className="col-span-2">
                      <span className={`inline-block px-3 py-1 rounded-xl text-xs font-semibold label-font ${getStatusColor(run.status)}`}>
                        {getStatusLabel(run.status)}
                      </span>
                    </div>
                    <div className="col-span-2 text-right">
                      {run.confidenceScore ? (
                        <span className="text-white font-semibold">{run.confidenceScore.toFixed(1)}%</span>
                      ) : (
                        <span className="text-white/40">—</span>
                      )}
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
            </div>
          )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
