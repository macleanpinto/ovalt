'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute, useAuth } from '@/lib/auth-context';
import ImportStepper from '@/components/ImportStepper';
import { apiClient } from '@/lib/api-client';

interface GTMContainer {
  containerId: string;
  name: string;
  accountId: string;
  publicId: string;
  path: string;
}

interface ImportResult {
  container: GTMContainer;
  importId: string;
  status: 'pending' | 'importing' | 'success' | 'error';
  error?: string;
}

export default function ImportAnalyze() {
  const router = useRouter();
  const { organization } = useAuth();
  const [isImporting, setIsImporting] = useState(true);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [allSuccess, setAllSuccess] = useState(false);
  const hasImportedRef = useRef(false);

  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (hasImportedRef.current) return;
    hasImportedRef.current = true;

    const importContainers = async () => {
      // Get selected containers from localStorage
      const storedData = localStorage.getItem('selected_containers');
      if (!storedData) {
        router.push('/import/select');
        return;
      }

      const containers: GTMContainer[] = JSON.parse(storedData);
      const gtmSession = localStorage.getItem('gtm_session');

      if (!gtmSession) {
        router.push('/import');
        return;
      }

      // Initialize results
      const initialResults: ImportResult[] = containers.map(c => ({
        container: c,
        importId: '',
        status: 'pending'
      }));
      setResults(initialResults);

      // Import each container
      let successCount = 0;
      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];

        // Update status to importing
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: 'importing' } : r
        ));

        try {
          const { importId } = await apiClient.importGtmContainer(gtmSession, container.path);

          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, importId, status: 'success' } : r
          ));
          successCount++;
        } catch (error: any) {
          console.error(`Failed to import ${container.name}:`, error);
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'error', error: error.message || 'Import failed' } : r
          ));
        }

        // Small delay between imports to avoid rate limits
        if (i < containers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setIsImporting(false);
      setAllSuccess(successCount === containers.length);
    };

    importContainers();
  }, [router]);

  const handleProceed = () => {
    // Clear the stored containers
    localStorage.removeItem('selected_containers');

    // Redirect to dashboard or migrations page
    router.push('/dashboard');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <svg className="w-6 h-6 text-[#7dfba9]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-6 h-6 text-[#ffb4ab]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'importing':
        return (
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#ff553c]"></div>
        );
      default:
        return (
          <div className="w-6 h-6 rounded-full border-2 border-outline"></div>
        );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-[#15a65e]/20 text-[#7dfba9] border border-[#5fde8f]/30';
      case 'error':
        return 'bg-[#93000a]/20 text-[#ffb4ab] border border-[#ffb4ab]/30';
      case 'importing':
        return 'bg-[#ff553c]/20 text-[#ffdad4] border border-[#ff553c]/30';
      default:
        return 'bg-[#353535] text-[#c6c6c7] border border-[#5d3f3a]';
    }
  };

  return (
    <ProtectedRoute>
      <main className="pt-24 pb-16 min-h-screen flex max-w-[1440px] mx-auto px-8 gap-12">
        <ImportStepper currentStep={3} />

        <section className="flex-1">
          <header className="mb-12">
            <h1 className="text-5xl font-bold tracking-tight text-white mb-4 headline-font">
              {isImporting ? 'Importing Containers' : allSuccess ? 'Import Complete' : 'Import Finished'}
            </h1>
            <p className="text-on-surface-variant text-lg max-w-2xl leading-relaxed">
              {isImporting
                ? 'Please wait while we import your GTM containers and analyze their configuration...'
                : 'Review the import results below. Successfully imported containers are ready for migration.'}
            </p>
          </header>

          {/* Import Results */}
          <div className="space-y-4 mb-8">
            {results.map((result, index) => (
              <div
                key={result.container.containerId}
                className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden"
              >
                <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {getStatusIcon(result.status)}

                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white headline-font">
                        {result.container.name}
                      </h3>
                      <code className="text-sm text-on-surface-variant font-mono">
                        {result.container.publicId}
                      </code>
                      {result.error && (
                        <p className="text-sm text-[#ffb4ab] mt-1">{result.error}</p>
                      )}
                      {result.importId && (
                        <p className="text-sm text-white/60 mt-1">Import ID: {result.importId.slice(0, 12)}...</p>
                      )}
                    </div>
                  </div>

                  <span className={`px-4 py-2 rounded-xl text-sm font-semibold label-font ${getStatusColor(result.status)}`}>
                    {result.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Card */}
          {!isImporting && (
            <div className={`rounded-xl p-6 border mb-8 ${
              allSuccess
                ? 'bg-gradient-to-r from-[#15a65e]/10 to-[#15a65e]/5 border-[#5fde8f]/20'
                : 'bg-gradient-to-r from-[#ff553c]/10 to-[#ff553c]/5 border-[#ff553c]/20'
            }`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  allSuccess ? 'bg-[#15a65e]/20' : 'bg-[#ff553c]/20'
                }`}>
                  {allSuccess ? (
                    <svg className="w-5 h-5 text-[#7dfba9]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-[#ff553c]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div>
                  <h4 className={`font-label text-sm uppercase tracking-widest mb-2 ${
                    allSuccess ? 'text-[#7dfba9]' : 'text-[#ff553c]'
                  }`}>
                    {allSuccess ? 'All Containers Imported' : 'Some Imports Failed'}
                  </h4>
                  <p className="text-white leading-relaxed">
                    {allSuccess
                      ? 'All containers have been successfully imported. You can now create migrations from your dashboard.'
                      : 'Some containers failed to import. Please check the errors above and try again for the failed containers.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={() => router.push('/import/select')}
              disabled={isImporting}
              className="flex items-center gap-2 text-white/50 hover:text-white transition-colors group disabled:opacity-30"
            >
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-label">Select Different Containers</span>
            </button>

            {!isImporting && (
              <button
                onClick={handleProceed}
                className="bg-[#ff553c] text-white px-8 py-4 rounded-xl font-bold tracking-tight hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-[#ff553c]/10 flex items-center gap-3 label-font"
              >
                Go to Dashboard
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            )}
          </div>
        </section>
      </main>
    </ProtectedRoute>
  );
}
