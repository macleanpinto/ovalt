'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute, useAuth } from '@/lib/auth-context';
import { apiClient, Import } from '@/lib/api-client';

export default function ImportsPage() {
  const router = useRouter();
  const { organization } = useAuth();
  const [imports, setImports] = useState<Import[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingMigration, setCreatingMigration] = useState<string | null>(null);
  const [deletingImport, setDeletingImport] = useState<string | null>(null);

  useEffect(() => {
    const loadImports = async () => {
      if (!organization) return;

      try {
        setIsLoading(true);
        const importsData = await apiClient.getImports(organization.organizationId);
        setImports(importsData);
      } catch (err: any) {
        setError(err.message || 'Failed to load imports');
      } finally {
        setIsLoading(false);
      }
    };

    loadImports();
  }, [organization]);

  const handleCreateMigration = async (importId: string) => {
    try {
      setCreatingMigration(importId);
      console.log('Creating migration for import:', importId);
      const run = await apiClient.createRun(importId);
      console.log('Migration created:', run);
      router.push(`/migrations/${run.runId}`);
    } catch (err: any) {
      console.error('Failed to create migration:', err);
      alert(`Failed to create migration: ${err.message}\n\nStatus: ${err.status || 'unknown'}\n\nCheck console for details.`);
      setCreatingMigration(null);
    }
  };

  const handleDeleteImport = async (importId: string) => {
    if (!confirm('Are you sure you want to delete this import? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingImport(importId);
      await apiClient.deleteImport(importId);
      setImports(prev => prev.filter(imp => imp.importId !== importId));
    } catch (err: any) {
      console.error('Failed to delete import:', err);
      alert(`Failed to delete import: ${err.message}`);
    } finally {
      setDeletingImport(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
      case 'success':
        return 'bg-green-500/10 text-green-400 border border-green-500/30';
      case 'processing':
        return 'bg-[#41ffaf]/10 text-[#41ffaf] border border-[#41ffaf]/30';
      case 'failed':
        return 'bg-red-500/10 text-red-400 border border-red-500/30';
      default:
        return 'bg-[#353535] text-[#bacbbe] border border-white/10';
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
        <header className="bg-[#1A1A1A]/80 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center w-full px-8 h-16 border-b border-white/5">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold tracking-tighter text-[#41ffaf]">Ovalt</span>
            <nav className="hidden md:flex gap-6 items-center">
              <Link className="text-gray-400 font-medium hover:text-white transition-colors" href="/dashboard">
                Dashboard
              </Link>
              <Link className="text-gray-400 font-medium hover:text-white transition-colors" href="/imports">
                Imports
              </Link>
              <Link className="text-gray-400 font-medium hover:text-white transition-colors" href="/migrations">
                All migrations
              </Link>
            </nav>
          </div>
        </header>

        <main className="p-8">
          <div className="max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2 text-white headline-font">Imports</h1>
                <p className="text-[#bacbbe]">
                  View all imported containers for {organization?.name || 'your organization'}
                </p>
              </div>
              <div className="flex gap-3">
                <Link
                  href="/import"
                  className="px-6 py-3 bg-[#41ffaf] text-[#003822] rounded-xl font-semibold label-font hover:opacity-90 transition-all"
                >
                  Import Container
                </Link>
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
                  <p className="mt-4 text-[#bacbbe]">Loading imports...</p>
                </div>
              </div>
            ) : error ? (
              <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl">
                <h2 className="text-lg font-semibold text-red-400 mb-2 headline-font">
                  Failed to load imports
                </h2>
                <p className="text-red-400">{error}</p>
              </div>
            ) : imports.length === 0 ? (
              <div className="bg-[#20201f] border border-white/10 rounded-xl p-12 text-center">
                <svg className="w-16 h-16 text-white/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <h3 className="text-xl font-bold text-white mb-2 headline-font">No Imports Yet</h3>
                <p className="text-[#bacbbe] mb-6">
                  Import a GTM container to get started with migrations.
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
                    Import ID
                  </div>
                  <div className="col-span-3 font-label text-xs uppercase tracking-widest text-white/50">
                    Project
                  </div>
                  <div className="col-span-2 font-label text-xs uppercase tracking-widest text-white/50">
                    Status
                  </div>
                  <div className="col-span-2 font-label text-xs uppercase tracking-widest text-white/50 text-right">
                    Created
                  </div>
                  <div className="col-span-2 font-label text-xs uppercase tracking-widest text-white/50 text-right">
                    Actions
                  </div>
                </div>

                {/* Table Rows */}
                <div className="divide-y divide-white/5">
                  {imports.map((imp) => (
                    <div
                      key={imp.importId}
                      className="grid grid-cols-12 px-6 py-5 hover:bg-[#2a2a2a] transition-colors items-center"
                    >
                      <div className="col-span-3">
                        <code className="text-sm text-white font-mono">{imp.importId.slice(0, 12)}...</code>
                      </div>
                      <div className="col-span-3">
                        <span className="text-sm text-white">{imp.projectId || 'GTM Container'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-block px-3 py-1 rounded-xl text-xs font-semibold label-font ${getStatusColor(imp.status)}`}>
                          {imp.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="col-span-2 text-right text-[#bacbbe] text-sm">
                        {formatRelativeTime(imp.createdAt)}
                      </div>
                      <div className="col-span-2 text-right flex gap-2 justify-end">
                        <button
                          onClick={() => handleCreateMigration(imp.importId)}
                          disabled={creatingMigration === imp.importId || deletingImport === imp.importId}
                          className="px-4 py-2 bg-[#41ffaf] text-[#003822] rounded-lg text-sm font-semibold label-font hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {creatingMigration === imp.importId ? (
                            <span className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#003822]"></div>
                              Creating...
                            </span>
                          ) : (
                            'Create Migration'
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteImport(imp.importId)}
                          disabled={deletingImport === imp.importId || creatingMigration === imp.importId}
                          className="px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-sm font-semibold label-font hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete import"
                        >
                          {deletingImport === imp.importId ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400"></div>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
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
