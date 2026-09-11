'use client';

import React, { useState } from 'react';
import { UserRole } from '@renewalradar/shared';

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  joinedAt: string;
}

export interface TeamSettingsProps {
  initialMembers?: TeamMember[];
  userRole?: UserRole;
}

export const TeamSettings: React.FC<TeamSettingsProps> = ({
  initialMembers,
  userRole = 'owner',
}) => {
  const [members, setMembers] = useState<TeamMember[]>(
    initialMembers ?? [
      {
        id: 'mem-1',
        userId: 'user-1',
        email: 'sarah.jenkins@acmelogistics.com',
        fullName: 'Sarah Jenkins',
        role: 'owner',
        joinedAt: '2026-08-15T09:00:00Z',
      },
      {
        id: 'mem-2',
        userId: 'user-2',
        email: 'dave.finance@acmelogistics.com',
        fullName: 'Dave Miller',
        role: 'admin',
        joinedAt: '2026-08-20T11:30:00Z',
      },
      {
        id: 'mem-3',
        userId: 'user-3',
        email: 'alex.ops@acmelogistics.com',
        fullName: 'Alex Chen',
        role: 'member',
        joinedAt: '2026-09-01T14:15:00Z',
      },
    ],
  );

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('viewer');
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canInvite = userRole === 'owner' || userRole === 'admin';

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsSubmitting(true);
    setInviteStatus(null);
    setLastInviteLink(null);

    try {
      // In full client-server mode, calls POST /api/v1/organizations/invitations
      const generatedToken = `inv_${Math.random().toString(36).substring(2, 10)}${Date.now()}`;
      const mockInviteLink = `${window.location.origin}/invite/accept?token=${generatedToken}`;

      // Add as pending/simulated viewer for immediate demo visibility
      const newMember: TeamMember = {
        id: `mem-${Date.now()}`,
        userId: `usr-${Date.now()}`,
        email: inviteEmail.trim().toLowerCase(),
        fullName: inviteEmail.split('@')[0] ?? 'Invited Member',
        role: inviteRole,
        joinedAt: new Date().toISOString(),
      };

      setMembers((prev) => [...prev, newMember]);
      setLastInviteLink(mockInviteLink);
      setInviteStatus(`Invitation generated for ${inviteEmail} as ${inviteRole.toUpperCase()}`);
      setInviteEmail('');
    } catch {
      setInviteStatus('Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = (memberId: string, memberRole: UserRole) => {
    if (memberRole === 'owner') {
      alert('Cannot remove the organization owner');
      return;
    }

    if (confirm('Are you sure you want to remove this member?')) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    }
  };

  const getRoleBadgeClass = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'admin':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'member':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'viewer':
        return 'bg-slate-100 text-slate-800 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Team Members & Permissions</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage organization members and assign role-based access control (RBAC).
          </p>
        </div>

        {canInvite && (
          <button
            onClick={() => setIsInviteOpen(!isInviteOpen)}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            {isInviteOpen ? 'Close Invite Form' : '+ Invite Member'}
          </button>
        )}
      </div>

      {/* Role Definitions Help Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg text-xs border border-slate-200">
        <div>
          <span className="font-semibold text-purple-700 block">Owner</span>
          Full administrative access, billing, and member governance.
        </div>
        <div>
          <span className="font-semibold text-indigo-700 block">Admin</span>
          Can invite members, manage obligations, and view audit logs.
        </div>
        <div>
          <span className="font-semibold text-blue-700 block">Member</span>
          Can create and edit obligations. Cannot invite members.
        </div>
        <div>
          <span className="font-semibold text-slate-700 block">Viewer</span>
          Strictly read-only access. Cannot create or edit obligations.
        </div>
      </div>

      {/* Invite Modal / Form Drawer */}
      {isInviteOpen && canInvite && (
        <form
          onSubmit={handleSendInvite}
          className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-4"
        >
          <h3 className="text-sm font-bold text-indigo-950">Invite Team Member</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Role *</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="viewer">Viewer (Read-only)</option>
                <option value="member">Member (Can edit obligations)</option>
                <option value="admin">Admin (Can invite and manage)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">
              Invited user will receive a secure single-use token expiring in 7 days.
            </span>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>

          {inviteStatus && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
              {inviteStatus}
              {lastInviteLink && (
                <div className="mt-1 font-mono text-[11px] text-slate-600 break-all select-all bg-white p-1.5 rounded border border-emerald-200">
                  Demo Link: {lastInviteLink}
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {/* Members Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <th className="py-3 px-4">Member Name</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Joined Date</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {members.map((member) => (
              <tr key={member.id} className="hover:bg-slate-50/75 transition-colors">
                <td className="py-3 px-4 font-medium text-slate-900">{member.fullName}</td>
                <td className="py-3 px-4 text-slate-600 font-mono text-xs">{member.email}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${getRoleBadgeClass(
                      member.role,
                    )}`}
                  >
                    {member.role}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-500 text-xs">
                  {new Date(member.joinedAt).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-right">
                  {member.role !== 'owner' && canInvite ? (
                    <button
                      onClick={() => handleRemoveMember(member.id, member.role)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Primary</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
