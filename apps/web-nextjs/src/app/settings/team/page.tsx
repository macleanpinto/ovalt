'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, ProtectedRoute } from '@/lib/auth-context';
import { apiClient, OrgMember, InviteWithUrl, OrgRole } from '@/lib/api-client';
import { useAlert } from '@/lib/alert-context';
import AppHeader from '@/components/AppHeader';
import { RampMain, RampPageHero, RampPanel } from '@/components/ramp-shell';

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer'
};

export default function TeamSettings() {
  const { organization, user } = useAuth();
  const alert = useAlert();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<InviteWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [sending, setSending] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const myRole = members.find((m) => m.userId === user?.userId)?.role;
  const canInvite = myRole === 'owner' || myRole === 'admin';
  const canManage = myRole === 'owner';

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        apiClient.listMembers(organization.organizationId),
        canInvite ? apiClient.listInvites(organization.organizationId) : Promise.resolve([])
      ]);
      setMembers(m);
      setInvites(i);
    } catch (err: any) {
      alert.error(`Failed to load team: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [organization, alert, canInvite]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!organization || !inviteEmail) return;
    setSending(true);
    try {
      const { invite, acceptUrl, emailSent } = await apiClient.createInvite(
        organization.organizationId,
        inviteEmail,
        inviteRole
      );
      setLastInviteUrl(acceptUrl);
      setInvites((prev) => [...prev, { ...invite, acceptUrl }]);
      setInviteEmail('');
      if (emailSent) {
        alert.success(`Invite sent to ${invite.email}. You can also copy the link below.`);
      } else {
        alert.info('Invite created. Email sending is not configured — copy the link to share.');
      }
    } catch (err: any) {
      // Seat-limit error carries a code
      if (err?.response?.code === 'seat_limit_reached') {
        alert.error(`Seat limit reached (${err.response.current}/${err.response.limit} on ${err.response.plan} plan).`);
      } else {
        alert.error(err.message || 'Failed to create invite');
      }
    } finally {
      setSending(false);
    }
  }

  async function revoke(invite: InviteWithUrl) {
    if (!organization) return;
    if (!confirm(`Revoke invite for ${invite.email}?`)) return;
    try {
      await apiClient.revokeInvite(organization.organizationId, invite.inviteId);
      setInvites((prev) => prev.filter((i) => i.inviteId !== invite.inviteId));
    } catch (err: any) {
      alert.error(err.message || 'Failed to revoke invite');
    }
  }

  async function changeRole(member: OrgMember, role: OrgRole) {
    if (!organization) return;
    try {
      await apiClient.updateMemberRole(organization.organizationId, member.userId, role);
      setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, role } : m)));
    } catch (err: any) {
      alert.error(err.message || 'Failed to change role');
    }
  }

  async function remove(member: OrgMember) {
    if (!organization) return;
    if (!confirm(`Remove ${member.email ?? member.userId} from the team?`)) return;
    try {
      await apiClient.removeMember(organization.organizationId, member.userId);
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    } catch (err: any) {
      alert.error(err.message || 'Failed to remove member');
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      alert.success('Invite link copied');
    } catch {
      alert.info(url);
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
        <AppHeader />
        <RampMain>
          <RampPageHero
            eyebrow="Settings"
            title="Team"
            description="Manage who has access to this organization. Invitees get a link they open to accept."
          />

          {canInvite && (
            <RampPanel padding="p-6 md:p-8" className="mb-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Invite teammates</h2>
                  <p className="text-sm text-zinc-400">Share the generated link &mdash; no email is sent.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInvite(true)}
                  className="self-start rounded-full bg-[#41ffaf] px-5 py-2.5 text-sm font-semibold text-[#003822] transition-opacity hover:opacity-90"
                >
                  Invite user
                </button>
              </div>
            </RampPanel>
          )}

          {/* Pending invites */}
          {canInvite && invites.length > 0 && (
            <RampPanel padding="p-6 md:p-8" className="mb-8">
              <h2 className="mb-4 text-lg font-semibold text-white">Pending invites</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-zinc-500">
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Role</th>
                      <th className="pb-3">Expires</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((i) => (
                      <tr key={i.inviteId} className="border-t border-white/5">
                        <td className="py-3">{i.email}</td>
                        <td className="py-3">{ROLE_LABELS[i.role]}</td>
                        <td className="py-3 text-zinc-400">{new Date(i.expiresAt).toLocaleDateString()}</td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => copy(i.acceptUrl)}
                            className="mr-3 text-sm font-semibold text-[#41ffaf] hover:underline"
                          >
                            Copy link
                          </button>
                          <button onClick={() => revoke(i)} className="text-sm font-semibold text-red-400 hover:underline">
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RampPanel>
          )}

          {/* Members */}
          <RampPanel padding="p-6 md:p-8">
            <h2 className="mb-4 text-lg font-semibold text-white">Members</h2>
            {loading ? (
              <p className="text-sm text-zinc-400">Loading…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-zinc-500">
                      <th className="pb-3">User</th>
                      <th className="pb-3">Role</th>
                      <th className="pb-3">Joined</th>
                      {canManage && <th className="pb-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.userId} className="border-t border-white/5">
                        <td className="py-3">
                          <div className="font-medium text-white">{m.name || m.email || m.userId}</div>
                          {m.email && m.name && <div className="text-xs text-zinc-500">{m.email}</div>}
                        </td>
                        <td className="py-3">
                          {canManage && m.userId !== user?.userId ? (
                            <select
                              value={m.role}
                              onChange={(e) => changeRole(m, e.target.value as OrgRole)}
                              className="rounded-md border border-white/10 bg-[#1c1b1b] px-2 py-1 text-sm"
                            >
                              <option value="owner">Owner</option>
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          ) : (
                            ROLE_LABELS[m.role]
                          )}
                        </td>
                        <td className="py-3 text-zinc-400">{new Date(m.joinedAt).toLocaleDateString()}</td>
                        {canManage && (
                          <td className="py-3 text-right">
                            {m.userId !== user?.userId && (
                              <button
                                onClick={() => remove(m)}
                                className="text-sm font-semibold text-red-400 hover:underline"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </RampPanel>
        </RampMain>

        {/* Invite modal */}
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1b1b] p-8 shadow-2xl">
              <h3 className="text-xl font-semibold text-white">Invite teammate</h3>
              <p className="mt-1 text-sm text-zinc-400">They&apos;ll see the link preview before joining.</p>
              <form onSubmit={submitInvite} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">Email</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#131313] px-3 py-2 text-sm text-white focus:border-[#41ffaf] focus:outline-none"
                    placeholder="teammate@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#131313] px-3 py-2 text-sm text-white focus:border-[#41ffaf] focus:outline-none"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                {lastInviteUrl && (
                  <div className="rounded-lg border border-[#41ffaf]/30 bg-[#41ffaf]/10 p-3 text-sm">
                    <p className="font-medium text-[#41ffaf]">Invite link</p>
                    <code className="mt-1 block break-all text-xs text-zinc-300">{lastInviteUrl}</code>
                    <button
                      type="button"
                      onClick={() => copy(lastInviteUrl)}
                      className="mt-2 text-xs font-semibold text-[#41ffaf] hover:underline"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInvite(false);
                      setLastInviteUrl(null);
                    }}
                    className="text-sm text-zinc-400 hover:text-white"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={sending || !inviteEmail}
                    className="rounded-full bg-[#41ffaf] px-5 py-2 text-sm font-semibold text-[#003822] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : 'Generate link'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
