'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, ProtectedRoute } from '@/lib/auth-context';
import { apiClient, AdminSummary, AdminOrgRow } from '@/lib/api-client';
import AppHeader from '@/components/AppHeader';
import { RampMain, RampPageHero, RampPanel } from '@/components/ramp-shell';

type SignupPoint = { date: string; count: number };

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [signups, setSignups] = useState<SignupPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!user.isPlatformAdmin) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    if (!user?.isPlatformAdmin) return;
    try {
      setIsLoading(true);
      const [s, sig] = await Promise.all([
        apiClient.getAdminSummary(),
        apiClient.getAdminSignups(30),
      ]);
      setSummary(s);
      setSignups(sig.series);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load admin metrics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.isPlatformAdmin) loadData();
  }, [user?.isPlatformAdmin]);

  useEffect(() => {
    const onFocus = () => {
      if (user?.isPlatformAdmin) loadData();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user?.isPlatformAdmin]);

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

  const maxSignup = signups.reduce((m, p) => Math.max(m, p.count), 0);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
        <AppHeader />
        <RampMain>
          <RampPageHero
            eyebrow="Platform"
            title="Admin dashboard"
            description="Cross-organization usage metrics for Ovalt platform operators."
          />

          {error ? (
            <RampPanel padding="p-6" className="mb-6 border-red-500/20 bg-red-500/5">
              <p className="text-red-400/90">{error}</p>
            </RampPanel>
          ) : null}

          {isLoading && !summary ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[#41ffaf] border-t-transparent" />
                <p className="mt-4 text-zinc-400">Loading admin metrics…</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <MetricTile label="Users" value={summary?.totalUsers ?? 0} />
                <MetricTile label="Organizations" value={summary?.totalOrganizations ?? 0} />
                <MetricTile label="Imports" value={summary?.totalImports ?? 0} />
                <MetricTile label="Migrations" value={summary?.totalMigrations ?? 0} />
                <MetricTile label="Tags deployed" value={summary?.totalTagsDeployed ?? 0} />
              </div>

              <div className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <RampPanel padding="p-6">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Active organizations (30d)
                  </p>
                  <p className="text-3xl font-semibold tracking-tight text-white">
                    {summary?.activeOrganizations30d ?? 0}
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">Orgs with at least one import or migration in the last 30 days.</p>
                </RampPanel>
                <RampPanel padding="p-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Plan breakdown</p>
                  <div className="grid grid-cols-3 gap-4">
                    <PlanCell label="Free" value={summary?.planBreakdown.free ?? 0} />
                    <PlanCell label="Pro" value={summary?.planBreakdown.pro ?? 0} />
                    <PlanCell label="Enterprise" value={summary?.planBreakdown.enterprise ?? 0} />
                  </div>
                </RampPanel>
              </div>

              <RampPanel padding="p-6 md:p-8" className="mb-10">
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Signups</h2>
                    <p className="text-sm text-zinc-500">New users per day, last {signups.length} days.</p>
                  </div>
                  <p className="text-sm text-zinc-400">
                    Total: {signups.reduce((n, p) => n + p.count, 0)}
                  </p>
                </div>
                <SignupsChart series={signups} max={maxSignup} />
              </RampPanel>

              <RampPanel padding="p-6 md:p-8">
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Organizations</h2>
                    <p className="text-sm text-zinc-500">
                      Sorted by tags deployed. {summary?.organizations.length ?? 0} total. Click a row to view that org&apos;s migrations.
                    </p>
                  </div>
                </div>
                <OrgTable rows={summary?.organizations ?? []} />
              </RampPanel>
            </>
          )}
        </RampMain>
      </div>
    </ProtectedRoute>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <RampPanel padding="p-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-white">{value.toLocaleString()}</p>
    </RampPanel>
  );
}

function PlanCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

function OrgTable({ rows }: { rows: AdminOrgRow[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-zinc-500">No organizations yet.</p>;
  }

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const planClass = (plan: string) => {
    switch (plan) {
      case 'pro':
        return 'bg-[#41ffaf]/10 text-[#41ffaf] border-[#41ffaf]/30';
      case 'enterprise':
        return 'bg-violet-500/10 text-violet-300 border-violet-500/30';
      default:
        return 'bg-white/5 text-zinc-300 border-white/10';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="py-3 pr-4">Organization</th>
            <th className="py-3 pr-4">Plan</th>
            <th className="py-3 pr-4">Owner</th>
            <th className="py-3 pr-4 text-right">Imports</th>
            <th className="py-3 pr-4 text-right">Migrations</th>
            <th className="py-3 pr-4 text-right">Tags deployed</th>
            <th className="py-3 pr-4">Last activity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map(row => {
            const href = `/admin/organizations/${encodeURIComponent(row.organizationId)}/migrations`;
            return (
              <tr
                key={row.organizationId}
                className="group cursor-pointer text-zinc-200 transition-colors hover:bg-white/[0.03]"
                onClick={() => {
                  window.location.href = href;
                }}
              >
                <td className="py-3 pr-4">
                  <Link href={href} className="block">
                    <div className="font-medium text-white group-hover:text-[#41ffaf]">{row.name}</div>
                    {row.slug ? <div className="text-xs text-zinc-500">{row.slug}</div> : null}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${planClass(row.plan)}`}>
                    {row.plan}
                  </span>
                </td>
                <td className="py-3 pr-4 text-zinc-400">{row.ownerEmail ?? '—'}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{row.imports.toLocaleString()}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{row.migrations.toLocaleString()}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{row.tagsDeployed.toLocaleString()}</td>
                <td className="py-3 pr-4 text-zinc-400">{fmtDate(row.lastActivityAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SignupsChart({ series, max }: { series: SignupPoint[]; max: number }) {
  if (series.length === 0) {
    return <p className="py-8 text-center text-zinc-500">No data</p>;
  }
  const scale = max > 0 ? max : 1;

  const shortDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  // Pick ~5 evenly-spaced tick indexes (first, last, and spread in between).
  const tickCount = Math.min(5, series.length);
  const tickIndexes = new Set<number>();
  for (let i = 0; i < tickCount; i++) {
    tickIndexes.add(Math.round((i * (series.length - 1)) / Math.max(tickCount - 1, 1)));
  }

  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
        <span>0</span>
        <span>max {max}</span>
      </div>
      <div className="flex h-40 items-end gap-[3px]">
        {series.map(point => {
          const heightPct = point.count > 0 ? Math.max((point.count / scale) * 100, 8) : 0;
          return (
            <div
              key={point.date}
              className="group relative flex h-full flex-1 flex-col justify-end"
              title={`${shortDate(point.date)}: ${point.count}`}
            >
              {point.count > 0 ? (
                <>
                  <span className="mb-1 text-center text-[10px] font-semibold text-[#41ffaf]">
                    {point.count}
                  </span>
                  <div
                    className="w-full rounded-t bg-[#41ffaf]/80 transition-colors group-hover:bg-[#41ffaf]"
                    style={{ height: `${heightPct}%` }}
                  />
                </>
              ) : (
                <div className="h-px w-full bg-white/5" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-[3px] text-[10px] text-zinc-500">
        {series.map((point, idx) => (
          <div key={point.date} className="flex-1 text-center whitespace-nowrap">
            {tickIndexes.has(idx) ? shortDate(point.date) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
