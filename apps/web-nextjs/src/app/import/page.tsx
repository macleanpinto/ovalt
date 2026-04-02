'use client';

import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/lib/auth-context';
import ImportStepper from '@/components/ImportStepper';
import { apiClient } from '@/lib/api-client';

export default function ImportConnect() {
  const router = useRouter();

  const handleConnectGoogle = async () => {
    try {
      // Start GTM OAuth via API (uses Bearer token) then redirect to Google
      const { url } = await apiClient.startGtmOAuth();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to start GTM OAuth:', error);
      alert('Failed to connect to Google. Please try again.');
    }
  };

  return (
    <ProtectedRoute>
      <main className="pt-24 pb-16 min-h-screen flex max-w-[1440px] mx-auto px-8 gap-12">
        <ImportStepper currentStep={1} />

        <section className="flex-1">
          <header className="mb-12">
            <h1 className="text-5xl font-bold tracking-tight text-white mb-4 headline-font">
              Connect Google Account
            </h1>
            <p className="text-on-surface-variant text-lg max-w-2xl leading-relaxed">
              Authorize Ovalt to access your Google Tag Manager containers. We&apos;ll need read-only access to import and analyze your current configuration.
            </p>
          </header>

          {/* Connection Card */}
          <div className="bg-surface-container rounded-xl overflow-hidden border border-outline-variant/10 p-12">
            <div className="max-w-2xl mx-auto text-center space-y-8">
              {/* Icon */}
              <div className="w-24 h-24 rounded-full bg-primary-container/20 flex items-center justify-center mx-auto">
                <svg className="w-12 h-12 text-[#ff553c]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white mb-3 headline-font">
                  Secure OAuth Connection
                </h2>
                <p className="text-on-surface-variant leading-relaxed">
                  We use industry-standard OAuth 2.0 to securely connect to your Google account.
                  We only request read-only access to your GTM containers and never store your Google credentials.
                </p>
              </div>

              {/* Permissions List */}
              <div className="bg-surface-container-low rounded-lg p-6 text-left">
                <h3 className="font-label text-xs uppercase tracking-widest text-[#ff553c] mb-4">
                  Permissions Required
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-white font-semibold">Read GTM Containers</p>
                      <p className="text-sm text-on-surface-variant">View your web and server containers</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-white font-semibold">Read Tags & Triggers</p>
                      <p className="text-sm text-on-surface-variant">Analyze your current tag configuration</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-white font-semibold">Basic Profile Info</p>
                      <p className="text-sm text-on-surface-variant">Your name and email for account association</p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Connect Button */}
              <button
                onClick={handleConnectGoogle}
                className="bg-[#ff553c] text-white px-12 py-4 rounded-xl font-bold tracking-tight hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-[#ff553c]/10 flex items-center gap-3 mx-auto label-font"
              >
                Connect Google Account
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>

              <p className="text-xs text-white/40">
                By connecting, you agree to our <a href="#" className="underline hover:text-white">Terms of Service</a> and <a href="#" className="underline hover:text-white">Privacy Policy</a>
              </p>
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 text-white/50 hover:text-white transition-colors group"
            >
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-label">Back to Dashboard</span>
            </button>
          </div>
        </section>
      </main>
    </ProtectedRoute>
  );
}
