'use client';

import React, { useId, useState } from 'react';
import { Clock3, LockKeyhole, Trash2, UserPlus } from 'lucide-react';
import { UserRole } from '@renewalradar/shared';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';

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

interface PendingInvitation {
  id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  createdAt: string;
}

type InviteFeedback =
  { tone: 'success'; message: string } | { tone: 'error'; message: string } | null;

const roleGuidance: Array<{
  role: UserRole;
  summary: string;
  restrictions: string;
}> = [
  {
    role: 'owner',
    summary: 'Full organization and billing control.',
    restrictions: 'Protected account; cannot be removed here.',
  },
  {
    role: 'admin',
    summary: 'Invites teammates and manages obligations.',
    restrictions: 'Cannot remove or replace the owner.',
  },
  {
    role: 'member',
    summary: 'Creates and edits obligations.',
    restrictions: 'Cannot invite or manage teammates.',
  },
  {
    role: 'viewer',
    summary: 'Reviews obligations and alerts.',
    restrictions: 'Read-only; cannot create or edit.',
  },
];

const roleTone: Record<UserRole, 'neutral' | 'info' | 'success'> = {
  owner: 'info',
  admin: 'success',
  member: 'neutral',
  viewer: 'neutral',
};

const memberDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

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
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('viewer');
  const [inviteFeedback, setInviteFeedback] = useState<InviteFeedback>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailId = useId();
  const roleId = useId();

  const canManageTeam = userRole === 'owner' || userRole === 'admin';

  const handleSendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsSubmitting(true);
    setInviteFeedback(null);
    setLastInviteLink(null);

    try {
      const normalizedEmail = inviteEmail.trim().toLowerCase();
      const generatedToken = `inv_${Math.random().toString(36).substring(2, 10)}${Date.now()}`;
      const inviteLink = `${window.location.origin}/invite/accept?token=${generatedToken}`;
      const invitation: PendingInvitation = {
        id: `invite-${Date.now()}`,
        email: normalizedEmail,
        role: inviteRole,
        createdAt: new Date().toISOString(),
      };

      setPendingInvitations((previous) => [...previous, invitation]);
      setLastInviteLink(inviteLink);
      setInviteFeedback({
        tone: 'success',
        message: `Demo invitation created for ${normalizedEmail}. It remains pending until accepted.`,
      });
      setInviteEmail('');
    } catch {
      setInviteFeedback({
        tone: 'error',
        message: 'The demo invitation could not be generated. Please try again.',
      });
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
      setMembers((previous) => previous.filter((member) => member.id !== memberId));
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface overflow-hidden" aria-labelledby="members-heading">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 id="members-heading" className="section-heading">
              Members
            </h2>
            <p className="muted mt-1 text-sm">
              Review who can access this organization and what they are allowed to do.
            </p>
          </div>
          {canManageTeam && (
            <button
              type="button"
              className="btn btn-primary self-start sm:self-auto"
              onClick={() => setIsInviteOpen(true)}
            >
              <UserPlus aria-hidden="true" className="h-4 w-4" />
              Invite member
            </button>
          )}
        </div>

        {!canManageTeam && (
          <div className="mx-4 mt-4 flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:mx-6">
            <LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <p className="text-sm text-slate-700">
              Your {userRole} role has read-only access to team settings. Only owners and admins can
              invite or remove teammates.
            </p>
          </div>
        )}

        <div className="hidden grid-cols-[minmax(0,1.7fr)_8rem_8rem_6rem] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <span>Member</span>
          <span>Role</span>
          <span>Joined</span>
          <span className="text-right">Access</span>
        </div>
        <div className="divide-y divide-slate-200">
          {members.map((member) => (
            <div
              key={member.id}
              className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.7fr)_8rem_8rem_6rem] md:items-center md:px-6"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{member.fullName}</p>
                <p className="mt-0.5 break-all text-sm text-slate-500">{member.email}</p>
              </div>
              <div className="flex items-center justify-between gap-3 md:block">
                <span className="text-xs font-medium text-slate-500 md:hidden">Role</span>
                <Badge tone={roleTone[member.role]}>{member.role}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm text-slate-600 md:block">
                <span className="text-xs font-medium text-slate-500 md:hidden">Joined</span>
                <time dateTime={member.joinedAt}>
                  {memberDateFormatter.format(new Date(member.joinedAt))}
                </time>
              </div>
              <div className="flex justify-end">
                {member.role === 'owner' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                    <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
                    Protected
                  </span>
                ) : canManageTeam ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.id, member.role)}
                    className="btn btn-ghost text-red-700 hover:bg-red-50"
                    aria-label={`Remove ${member.fullName}`}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    Remove
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">Read only</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {pendingInvitations.length > 0 && (
        <section className="surface overflow-hidden" aria-labelledby="pending-heading">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
            <h2 id="pending-heading" className="section-heading">
              Pending invitations
            </h2>
            <p className="muted mt-1 text-sm">
              Locally generated demo invitations are not active members.
            </p>
          </div>
          <div className="divide-y divide-slate-200">
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-slate-900">
                    {invitation.email}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                    Created {memberDateFormatter.format(new Date(invitation.createdAt))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="medium">Pending</Badge>
                  <Badge tone={roleTone[invitation.role]}>{invitation.role}</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="surface p-4 sm:p-6" aria-labelledby="roles-heading">
        <div>
          <h2 id="roles-heading" className="section-heading">
            Role guide
          </h2>
          <p className="muted mt-1 text-sm">
            Permissions become more restricted from owner to viewer.
          </p>
        </div>
        <dl className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {roleGuidance.map((item) => (
            <div
              key={item.role}
              className="grid gap-2 py-4 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4"
            >
              <dt>
                <Badge tone={roleTone[item.role]}>{item.role}</Badge>
              </dt>
              <dd className="text-sm text-slate-700">{item.summary}</dd>
              <dd className="text-sm text-slate-500">{item.restrictions}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Dialog
        open={isInviteOpen && canManageTeam}
        onClose={() => setIsInviteOpen(false)}
        title="Invite a team member"
        description="Generate a demo invitation link and choose the access they would receive after acceptance."
      >
        <form onSubmit={handleSendInvite} className="space-y-5">
          <div>
            <label htmlFor={emailId} className="field-label">
              Email address
            </label>
            <input
              id={emailId}
              type="email"
              required
              autoComplete="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="colleague@company.com"
              className="field"
            />
          </div>
          <div>
            <label htmlFor={roleId} className="field-label">
              Role
            </label>
            <select
              id={roleId}
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value as 'admin' | 'member' | 'viewer')
              }
              className="field"
            >
              <option value="viewer">Viewer — read-only</option>
              <option value="member">Member — edit obligations</option>
              <option value="admin">Admin — invite and manage</option>
            </select>
            <p className="muted mt-2 text-xs">
              This local demo generates a link only. It does not send email or add an accepted
              member.
            </p>
          </div>

          {inviteFeedback && (
            <div
              className={inviteFeedback.tone === 'success' ? 'feedback-success' : 'feedback-error'}
              role={inviteFeedback.tone === 'error' ? 'alert' : 'status'}
            >
              <p>{inviteFeedback.message}</p>
              {lastInviteLink && (
                <p className="mt-2 break-all font-mono text-xs select-all">
                  Demo link: {lastInviteLink}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsInviteOpen(false)}
            >
              Close
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? 'Generating…' : 'Generate invitation'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
