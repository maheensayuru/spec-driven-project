'use client';

import React, { useEffect, useId, useState } from 'react';
import { Clock3, LockKeyhole, Trash2, UserPlus } from 'lucide-react';
import { UserRole } from '@renewalradar/shared';
import { apiRequest } from '../../lib/api';
import { useSession } from '../SessionProvider';
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

interface MembersResponse {
  items: TeamMember[];
  total: number;
}

interface CreatedInvitation {
  id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  token: string;
  expiresAt: string;
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

export const TeamSettings: React.FC = () => {
  const { session } = useSession();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<CreatedInvitation[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [reloadMembers, setReloadMembers] = useState(0);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('viewer');
  const [inviteFeedback, setInviteFeedback] = useState<InviteFeedback>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailId = useId();
  const roleId = useId();

  const userRole = session?.role;
  const canManageTeam = userRole === 'owner' || userRole === 'admin';

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingMembers(true);
    setMembersError(null);

    apiRequest<MembersResponse>('/organizations/members', { signal: controller.signal })
      .then((response) => {
        setMembers(response.items);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMembersError(
          error instanceof Error ? error.message : 'Team members could not be loaded.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMembers(false);
      });

    return () => controller.abort();
  }, [reloadMembers]);

  const handleSendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim() || !canManageTeam) return;

    setIsSubmitting(true);
    setInviteFeedback(null);
    setLastInviteLink(null);

    try {
      const invitation = await apiRequest<CreatedInvitation>('/organizations/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
        }),
      });
      const inviteLink = `${window.location.origin}/invite/accept?token=${encodeURIComponent(invitation.token)}`;

      setPendingInvitations((previous) => [
        ...previous.filter((item) => item.id !== invitation.id),
        invitation,
      ]);
      setLastInviteLink(inviteLink);
      setInviteFeedback({
        tone: 'success',
        message: `Invitation created for ${invitation.email}. Share the link below securely.`,
      });
      setInviteEmail('');
    } catch (error: unknown) {
      setInviteFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The invitation could not be created.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (member.role === 'owner' || !canManageTeam) return;
    if (!window.confirm(`Remove ${member.fullName} from this organization?`)) return;

    setRemovingUserId(member.userId);
    setMembersError(null);
    try {
      await apiRequest<void>(`/organizations/members/${encodeURIComponent(member.userId)}`, {
        method: 'DELETE',
      });
      setMembers((previous) => previous.filter((item) => item.userId !== member.userId));
    } catch (error: unknown) {
      setMembersError(
        error instanceof Error ? error.message : 'The team member could not be removed.',
      );
    } finally {
      setRemovingUserId(null);
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
              onClick={() => {
                setInviteFeedback(null);
                setLastInviteLink(null);
                setIsInviteOpen(true);
              }}
            >
              <UserPlus aria-hidden="true" className="h-4 w-4" />
              Invite member
            </button>
          )}
        </div>

        {userRole && !canManageTeam && (
          <div className="mx-4 mt-4 flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:mx-6">
            <LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <p className="text-sm text-slate-700">
              Your {userRole} role has read-only access to team settings. Only owners and admins can
              invite or remove teammates.
            </p>
          </div>
        )}

        {membersError && (
          <div className="feedback-error m-4 sm:m-6" role="alert">
            <p>{membersError}</p>
            <button
              type="button"
              className="btn btn-secondary mt-3"
              onClick={() => setReloadMembers((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        )}

        <div className="hidden grid-cols-[minmax(0,1.7fr)_8rem_8rem_6rem] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <span>Member</span>
          <span>Role</span>
          <span>Joined</span>
          <span className="text-right">Access</span>
        </div>
        {isLoadingMembers ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500 sm:px-6" role="status">
            Loading team members…
          </p>
        ) : members.length === 0 && !membersError ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500 sm:px-6">
            No organization members were returned.
          </p>
        ) : (
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
                      onClick={() => void handleRemoveMember(member)}
                      disabled={removingUserId === member.userId}
                      className="btn btn-ghost text-red-700 hover:bg-red-50"
                      aria-label={`Remove ${member.fullName}`}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      {removingUserId === member.userId ? 'Removing…' : 'Remove'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">Read only</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {pendingInvitations.length > 0 && (
        <section className="surface overflow-hidden" aria-labelledby="pending-heading">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
            <h2 id="pending-heading" className="section-heading">
              Invitations created this visit
            </h2>
            <p className="muted mt-1 text-sm">
              The API does not provide invitation history. Only invitations created in this view
              appear here.
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
                    Expires {memberDateFormatter.format(new Date(invitation.expiresAt))}
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
        description="Create a secure invitation link and choose the access granted after acceptance."
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
              The invitation expires after seven days. Share the returned link directly with this
              person.
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
                  Invitation link: {lastInviteLink}
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
              {isSubmitting ? 'Creating…' : 'Create invitation'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
