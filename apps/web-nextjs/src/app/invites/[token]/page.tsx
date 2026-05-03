'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiClient, PublicInvite } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiClient
      .getInvitePreview(token)
      .then(setInvite)
      .catch((err) => setError(err.message || 'Invite not found'))
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    try {
      const res = await apiClient.acceptInvite(token);
      apiClient.setToken(res.token);
      window.location.replace('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Could not accept invite');
    } finally {
      setAccepting(false);
    }
  }

  if (loading || authLoading) {
    return <Centered>Loading invite…</Centered>;
  }

  if (error || !invite) {
    return <Centered tone="error">{error || 'Invite not found'}</Centered>;
  }

  if (invite.status !== 'pending') {
    return (
      <Centered tone="error">
        This invite has already been {invite.status}. Ask the inviter to send a new one.
      </Centered>
    );
  }

  if (invite.expired) {
    return <Centered tone="error">This invite has expired.</Centered>;
  }

  // Authenticated path: show the email-match state + Accept button
  if (isAuthenticated && user) {
    const emailMatches = user.email.toLowerCase() === invite.email.toLowerCase();

    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-white">You&apos;ve been invited</h1>
        <p className="mt-2 text-zinc-400">
          Join <span className="font-semibold text-white">{invite.organizationName}</span> as a{' '}
          <span className="font-semibold text-[#41ffaf]">{invite.role}</span>.
        </p>

        {emailMatches ? (
          <button
            onClick={accept}
            disabled={accepting}
            className="mt-8 w-full rounded-full bg-[#41ffaf] px-6 py-3 text-sm font-semibold text-[#003822] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {accepting ? 'Joining…' : `Join ${invite.organizationName}`}
          </button>
        ) : (
          <div className="mt-6 rounded-lg border border-orange-500/40 bg-orange-950/50 p-4 text-sm text-orange-200">
            This invite is for <span className="font-semibold">{invite.email}</span>, but you&apos;re signed in as{' '}
            <span className="font-semibold">{user.email}</span>. Sign out and use the correct account.
          </div>
        )}
      </Shell>
    );
  }

  // Unauthenticated path: point to register with token pre-filled
  const registerHref = `/auth/register?inviteToken=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}`;
  const loginHref = `/auth/login?redirect=${encodeURIComponent(`/invites/${token}`)}`;

  return (
    <Shell>
      <h1 className="text-2xl font-semibold text-white">You&apos;ve been invited</h1>
      <p className="mt-2 text-zinc-400">
        Join <span className="font-semibold text-white">{invite.organizationName}</span> as a{' '}
        <span className="font-semibold text-[#41ffaf]">{invite.role}</span>.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={registerHref}
          className="rounded-full bg-[#41ffaf] px-6 py-3 text-center text-sm font-semibold text-[#003822] transition-opacity hover:opacity-90"
        >
          Create account & join
        </Link>
        <Link
          href={loginHref}
          className="rounded-full border border-white/15 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/5"
        >
          I already have an account
        </Link>
      </div>
      <p className="mt-4 text-xs text-zinc-500">This link expires on {new Date(invite.expiresAt).toLocaleDateString()}.</p>
    </Shell>
  );
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#131313] p-6 text-center">
      <div className={`max-w-md rounded-2xl border border-white/10 bg-[#1c1b1b] p-8 ${tone === 'error' ? 'text-red-300' : 'text-zinc-300'}`}>
        {children}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#131313] p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1b1b] p-8 shadow-2xl">{children}</div>
    </div>
  );
}
