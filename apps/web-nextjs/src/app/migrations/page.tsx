'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute, useAuth } from '@/lib/auth-context';
import { apiClient, Run } from '@/lib/api-client';

export default function MigrationsPage() {
  const router = useRouter();
  const { organization } = useAuth();
  const [runs, setRuns] = useState<Run[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRuns = async () => {
      if (!organization) return;

      try {
        setIsLoading(true);
        const runsData = await apiClient.getRuns(organization.organizationId);
        setRuns(runsData);
      } catch (err: any) {
        setError(err.message || 'Failed to load migrations');
      } finally {
        setIsLoading(false);
      }
    };

    loadRuns();
  }, [organization]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-[#15a65e]/20 text-[#7dfba9] border border-[#5fde8f]/30';
      case 'running':
      case 'queued':
        return 'bg-[#ffb4a7]/20 text-[#ffb4a7] border border-[#ffb4a7]/30';
      case 'failed':
        return 'bg-[#93000a]/20 text-[#ffb4ab] border border-[#ffb4ab]/30';
      case 'needs_review':
        return 'bg-[#ff553c]/20 text-[#ffdad4] border border-[#ff553c]/30';
      default:
        return 'bg-[#353535] text-[#c6c6c7] border border-[#5d3f3a]';
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
      <main className="min-h-screen p-8 bg-[#131313]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-white headline-font">Migrations</h1>
              <p className="text-[#e6bdb6]">
                View all migration runs for {organization?.name || 'your organization'}
              </p>
            </div>
            <Link
              href="/dashboard"
              className="px-6 py-3 border border-[#ad8881]/30 text-white rounded-xl hover:bg-[#2a2a2a] transition-colors label-font"
            >
              Back to Dashboard
            </Link>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ffb4a7] mx-auto"></div>
                <p className="mt-4 text-[#e6bdb6]">Loading migrations...</p>
              </div>
            </div>
          ) : error ? (
            <div className="p-6 bg-[#93000a]/20 border border-[#ffb4ab]/20 rounded-xl">
              <h2 className="text-lg font-semibold text-[#ffb4ab] mb-2 headline-font">
                Failed to load migrations
              </h2>
              <p className="text-[#ffb4ab]">{error}</p>
            </div>
          ) : runs.length === 0 ? (
            <div className="bg-[#20201f] border border-[#5d3f3a]/15 rounded-xl p-12 text-center">
              <svg className="w-16 h-16 text-white/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="text-xl font-bold text-white mb-2 headline-font">No Migrations Yet</h3>
              <p className="text-[#e6bdb6] mb-6">
                Import a GTM container first, then create a migration run.
              </p>
              <Link
                href="/import"
                className="inline-block px-6 py-3 bg-[#ff553c] text-white rounded-xl font-semibold label-font hover:brightness-110 transition-all"
              >
                Import Container
              </Link>
            </div>
          ) : (
            <div className="bg-[#20201f] border border-[#5d3f3a]/15 rounded-xl shadow-lg overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 bg-[#353535]/50 px-6 py-4 border-b border-[#5d3f3a]/15">
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
              <div className="divide-y divide-[#5d3f3a]/15">
                {runs.map((run) => (
                  <div
                    key={run.runId}
                    className="grid grid-cols-12 px-6 py-5 hover:bg-[#2a2a2a] transition-colors items-center"
                  >
                    <Link href={`/migrations/${run.runId}`} className="col-span-3">
                      <code className="text-sm text-white font-mono hover:text-[#ffb4a7]">{run.runId.slice(0, 12)}...</code>
                    </Link>
                    <div className="col-span-3">
                      <code className="text-sm text-white/60 font-mono">{run.importId?.slice(0, 12)}...</code>
                    </div>
                    <div className="col-span-2">
                      <span className={`inline-block px-3 py-1 rounded-xl text-xs font-semibold label-font ${getStatusColor(run.status)}`}>
                        {run.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="col-span-2 text-right">
                      {run.confidenceScore ? (
                        <span className="text-white font-semibold">{run.confidenceScore.toFixed(1)}%</span>
                      ) : (
                        <span className="text-white/40">—</span>
                      )}
                    </div>
                    <div className="col-span-1 text-right text-[#e6bdb6] text-sm">
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
                          } catch (err: any) {
                            alert(`Failed to delete: ${err.message}`);
                          }
                        }}
                        className="px-3 py-1.5 bg-[#93000a]/20 text-[#ffb4ab] rounded-lg text-xs font-bold hover:bg-[#93000a]/40 transition-all"
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
    </ProtectedRoute>
  );
}
