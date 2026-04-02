'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/lib/auth-context';
import ImportStepper from '@/components/ImportStepper';
import { apiClient } from '@/lib/api-client';

interface GTMContainer {
  containerId: string;
  name: string;
  accountId: string;
  publicId: string;
  path: string;
  tagManagerUrl?: string;
  usageContext?: string[];
}

function ImportSelectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedContainers, setSelectedContainers] = useState<Set<string>>(new Set());
  const [containers, setContainers] = useState<GTMContainer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const gtmSession = searchParams.get('gtmSession');
    const gtmError = searchParams.get('gtmError');

    if (gtmSession) {
      localStorage.setItem('gtm_session', gtmSession);
    }
    if (gtmError) {
      setError(`GTM OAuth error: ${gtmError}`);
      setIsLoading(false);
      return;
    }

    // Fetch containers
    const loadContainers = async () => {
      try {
        setIsLoading(true);
        const sessionId = gtmSession || localStorage.getItem('gtm_session');

        if (!sessionId) {
          router.push('/import');
          return;
        }

        // First, get accounts
        const { accounts } = await apiClient.getGtmAccounts(sessionId);

        if (!accounts || accounts.length === 0) {
          setError('No GTM accounts found. Please ensure you have access to GTM.');
          setIsLoading(false);
          return;
        }

        // Then, get containers for all accounts
        const allContainers: GTMContainer[] = [];
        for (const account of accounts) {
          const accountPath = account.path || account.accountId;
          try {
            const { containers: accountContainers } = await apiClient.getGtmContainers(sessionId, accountPath);

            // Map to our interface
            const mapped = (accountContainers || []).map((c: any) => ({
              containerId: c.containerId || c.path?.split('/').pop() || '',
              name: c.name || 'Unnamed Container',
              accountId: account.accountId || account.path?.split('/').pop() || '',
              publicId: c.publicId || '',
              path: c.path || '',
              tagManagerUrl: c.tagManagerUrl,
              usageContext: c.usageContext || []
            }));

            allContainers.push(...mapped);
          } catch (err) {
            console.error(`Failed to load containers for account ${accountPath}:`, err);
          }
        }

        setContainers(allContainers);
      } catch (err: any) {
        console.error('Failed to load containers:', err);
        setError(err.message || 'Failed to load GTM containers');
      } finally {
        setIsLoading(false);
      }
    };

    loadContainers();
  }, [searchParams, router]);

  const toggleContainer = (containerId: string) => {
    const newSelected = new Set(selectedContainers);
    if (newSelected.has(containerId)) {
      newSelected.delete(containerId);
    } else {
      newSelected.add(containerId);
    }
    setSelectedContainers(newSelected);
  };

  const toggleAll = () => {
    if (selectedContainers.size === containers.length) {
      setSelectedContainers(new Set());
    } else {
      setSelectedContainers(new Set(containers.map(c => c.containerId)));
    }
  };

  const handleAnalyze = () => {
    if (selectedContainers.size > 0) {
      // Store selected containers data in localStorage for the analyze page
      const selectedData = containers.filter(c => selectedContainers.has(c.containerId));
      localStorage.setItem('selected_containers', JSON.stringify(selectedData));
      router.push(`/import/analyze`);
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <main className="pt-24 pb-16 min-h-screen flex max-w-[1440px] mx-auto px-8 gap-12">
          <ImportStepper currentStep={2} />
          <section className="flex-1">
            <div className="bg-surface-container rounded-xl p-16 border border-outline-variant/10">
              <div className="text-center space-y-6">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#ff553c] mx-auto"></div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2 headline-font">Loading Containers</h3>
                  <p className="text-on-surface-variant">Fetching your GTM containers...</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute>
        <main className="pt-24 pb-16 min-h-screen flex max-w-[1440px] mx-auto px-8 gap-12">
          <ImportStepper currentStep={2} />
          <section className="flex-1">
            <div className="bg-[#93000a]/20 border border-[#ffb4ab]/20 rounded-xl p-8">
              <h3 className="text-xl font-bold text-[#ffb4ab] mb-2 headline-font">Error Loading Containers</h3>
              <p className="text-[#ffb4ab] mb-6">{error}</p>
              <button
                onClick={() => router.push('/import')}
                className="px-6 py-3 bg-[#ff553c] text-white rounded-xl font-semibold hover:brightness-110 transition-all"
              >
                Try Again
              </button>
            </div>
          </section>
        </main>
      </ProtectedRoute>
    );
  }

  if (containers.length === 0) {
    return (
      <ProtectedRoute>
        <main className="pt-24 pb-16 min-h-screen flex max-w-[1440px] mx-auto px-8 gap-12">
          <ImportStepper currentStep={2} />
          <section className="flex-1">
            <div className="bg-surface-container rounded-xl p-12 border border-outline-variant/10 text-center">
              <svg className="w-16 h-16 text-white/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <h3 className="text-xl font-bold text-white mb-2 headline-font">No Containers Found</h3>
              <p className="text-on-surface-variant mb-6">
                No GTM containers were found in your account. Please create a container in Google Tag Manager first.
              </p>
              <button
                onClick={() => router.push('/import')}
                className="px-6 py-3 bg-[#ff553c] text-white rounded-xl font-semibold hover:brightness-110 transition-all"
              >
                Back
              </button>
            </div>
          </section>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="pt-24 pb-16 min-h-screen flex max-w-[1440px] mx-auto px-8 gap-12">
        <ImportStepper currentStep={2} />

        <section className="flex-1">
          <header className="mb-12">
            <h1 className="text-5xl font-bold tracking-tight text-white mb-4 headline-font">
              Select Container
            </h1>
            <p className="text-on-surface-variant text-lg max-w-2xl leading-relaxed">
              Choose the GTM containers you wish to analyze for server-side migration. We&apos;ll perform a deep technical audit on each.
            </p>
          </header>

          {/* Container Table */}
          <div className="bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10">
            {/* Table Header */}
            <div className="grid grid-cols-12 bg-surface-container-highest/50 px-6 py-4 border-b border-outline-variant/10">
              <div className="col-span-1 flex items-center">
                <input
                  type="checkbox"
                  checked={selectedContainers.size === containers.length}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-outline-variant bg-surface-container text-[#ff553c] focus:ring-[#ff553c]"
                />
              </div>
              <div className="col-span-5 font-label text-xs uppercase tracking-widest text-white/50">
                Container Name
              </div>
              <div className="col-span-3 font-label text-xs uppercase tracking-widest text-white/50 text-right">
                Container ID
              </div>
              <div className="col-span-3 font-label text-xs uppercase tracking-widest text-white/50 text-right">
                Account ID
              </div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-outline-variant/10">
              {containers.map((container) => {
                const isSelected = selectedContainers.has(container.containerId);

                return (
                  <div
                    key={container.containerId}
                    className="grid grid-cols-12 px-6 py-6 hover:bg-surface-container-high transition-colors items-center group cursor-pointer"
                    onClick={() => toggleContainer(container.containerId)}
                  >
                    <div className="col-span-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleContainer(container.containerId)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-outline-variant bg-surface-container text-[#ff553c] focus:ring-[#ff553c]"
                      />
                    </div>

                    <div className="col-span-5 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded flex items-center justify-center ${
                        isSelected ? 'bg-primary-container/20' : 'bg-surface-container-highest'
                      }`}>
                        <svg className={`w-5 h-5 ${isSelected ? 'text-[#ff553c]' : 'text-white/40'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="font-semibold text-white">{container.name}</span>
                    </div>

                    <div className="col-span-3 text-right">
                      <code className={`text-xs px-2 py-1 rounded font-mono ${
                        isSelected
                          ? 'bg-surface-container-lowest text-secondary'
                          : 'bg-surface-container-lowest text-white/40'
                      }`}>
                        {container.publicId}
                      </code>
                    </div>

                    <div className="col-span-3 text-right text-on-surface-variant text-sm">
                      {container.accountId}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={() => router.push('/import')}
              className="flex items-center gap-2 text-white/50 hover:text-white transition-colors group"
            >
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-label">Change Account</span>
            </button>

            <div className="flex items-center gap-6">
              <span className="text-on-surface-variant text-sm font-label">
                {selectedContainers.size} Container{selectedContainers.size !== 1 ? 's' : ''} Selected
              </span>
              <button
                onClick={handleAnalyze}
                disabled={selectedContainers.size === 0}
                className="bg-[#ff553c] text-white px-8 py-4 rounded-xl font-bold tracking-tight hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-[#ff553c]/10 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed label-font"
              >
                Analyze Readiness
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </main>
    </ProtectedRoute>
  );
}

export default function ImportSelect() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#131313] flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ff553c]" />
        </div>
      }
    >
      <ImportSelectInner />
    </Suspense>
  );
}
