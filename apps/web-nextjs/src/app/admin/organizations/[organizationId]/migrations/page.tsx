'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, ProtectedRoute } from '@/lib/auth-context';
import { apiClient, AdminOrgMigrations } from '@/lib/api-client';
import AppHeader from '@/components/AppHeader';
import { RampMain, RampPageHero, RampPanel } from '@/components/ramp-shell';

export default function AdminOrgMigrationsPage() {
  const router = useRouter();
  const params = useParams<{ organizationId: string }>();
  const organizationId = params?.organizationId ? decodeURIComponent(params.organizationId) : '';
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<AdminOrgMigrations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!user.isPlatformAdmin) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user?.isPlatformAdmin || !organizationId) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const res = await apiClient.getAdminOrgMigrations(organizationId);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load migrations');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.isPlatformAdmin, organizationId]);

  if (authLoading || (user && !user.isPlatformAdmin)) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
          <AppHeader />
          <RampMain>
            <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">Loading…</div>
          </RampMain>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
        <AppHeader />
        <RampMain>
          <RampPageHero
            eyebrow="Platform · Organization"
            title={data?.organization.name ?? 'Organization migrations'}
            description={
              data
                ? `${data.migrations.length} migration${data.migrations.length === 1 ? '' : 's'} · ${data.organization.plan} plan${data.organization.ownerEmail ? ` · owner ${data.organization.ownerEmail}` : ''}`
                : 'Loading organization…'
            }
            actions={
              <Link
                href="/admin"
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                Back to admin
              </Link>
            }
          />

          {error ? (
            <RampPanel padding="p-6" className="mb-6 border-red-500/25 bg-red-500/5">
              <p className="text-red-400/90">{error}</p>
            </RampPanel>
          ) : null}

          {isLoading && !data ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[#41ffaf] border-t-transparent" />
                <p className="mt-4 text-zinc-400">Loading migrations…</p>
              </div>
            </div>
          ) : data && data.migrations.length === 0 ? (
            <RampPanel padding="p-12 md:p-16" className="text-center">
              <h3 className="headline-font mb-2 text-xl font-bold text-white">No migrations</h3>
              <p className="text-[#bacbbe]">This organization has not run any migrations yet.</p>
            </RampPanel>
          ) : data ? (
            <RampPanel padding="p-0" className="overflow-hidden">
              <div className="grid grid-cols-12 border-b border-white/[0.08] bg-white/[0.03] px-6 py-4">
                <div className="col-span-3 font-label text-xs uppercase tracking-widest text-white/50">Run ID</div>
                <div className="col-span-3 font-label text-xs uppercase tracking-widest text-white/50">Import ID</div>
                <div className="col-span-2 font-label text-xs uppercase tracking-widest text-white/50">Status</div>
                <div className="col-span-2 font-label text-xs uppercase tracking-widest text-white/50 text-right">Tags deployed</div>
                <div className="col-span-2 font-label text-xs uppercase tracking-widest text-white/50 text-right">Created</div>
              </div>

              <div className="divide-y divide-white/[0.06]">
                {data.migrations.map((run) => (
                  <Link
                    key={run.runId}
                    href={`/migrations/${run.runId}?organizationId=${encodeURIComponent(data.organization.organizationId)}`}
                    className="grid grid-cols-12 items-center px-6 py-5 transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="col-span-3">
                      <code className="font-mono text-sm text-white group-hover:text-[#41ffaf]">
                        {run.runId.slice(0, 12)}…
                      </code>
                    </div>
                    <div className="col-span-3">
                      <code className="font-mono text-sm text-white/60">{run.importId?.slice(0, 12) ?? '—'}…</code>
                    </div>
                    <div className="col-span-2">
                      <span className={`label-font inline-block rounded-xl px-3 py-1 text-xs font-semibold ${statusClass(run.status)}`}>
                        {run.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="col-span-2 text-right text-sm tabular-nums text-zinc-200">
                      {typeof run.deployedTagCount === 'number' ? run.deployedTagCount.toLocaleString() : '—'}
                    </div>
                    <div className="col-span-2 text-right text-sm text-[#bacbbe]">{fmtDate(run.createdAt)}</div>
                  </Link>
                ))}
              </div>
            </RampPanel>
          ) : null}
        </RampMain>
      </div>
    </ProtectedRoute>
  );
}

function statusClass(status: string): string {
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
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
