import crypto from 'node:crypto';
import { db } from '../../db/connection.js';
import * as schema from '../../db/schema/index.js';
import { eq, and, gt } from 'drizzle-orm';
import { SessionService } from '../auth/session.service.js';
import type { Role } from '../auth/rbac.service.js';

export interface CreateInvitationInput {
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invitedBy?: string;
}

export interface AcceptInvitationInput {
  token: string;
  fullName: string;
  password: string;
}

export interface MemberListItem {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  joinedAt: string;
}

export interface OrganizationInvitationRecord {
  id: string;
  organizationId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invitedBy?: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export class InvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvitationError';
  }
}

export class OrganizationService {
  /**
   * Creates an invitation with a secure single-use token expiring in 7 days (FR-004 & Task T026).
   */
  static async createInvitation(
    organizationId: string,
    input: CreateInvitationInput,
  ): Promise<OrganizationInvitationRecord> {
    const [invitation] = await db
      .insert(schema.organizationInvitations)
      .values({
        organizationId,
        email: input.email.toLowerCase().trim(),
        role: input.role,
        token: crypto.randomBytes(32).toString('hex'),
        status: 'pending',
        invitedBy: input.invitedBy ?? null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();

    if (!invitation) {
      throw new Error('Failed to persist organization invitation');
    }

    return {
      ...invitation,
      role: invitation.role as OrganizationInvitationRecord['role'],
      status: invitation.status as OrganizationInvitationRecord['status'],
    };
  }

  /**
   * Accepts an invitation token, provisions user account (if new), and binds membership (Task T026).
   */
  static async acceptInvitation(input: AcceptInvitationInput): Promise<{
    user: { id: string; email: string; fullName: string };
    organization: { id: string; role: Role };
    sessionToken: string;
  }> {
    const fullName = input.fullName.trim();
    const passwordHash = await SessionService.hashPassword(input.password);

    const accepted = await db.transaction(async (tx) => {
      const [invitation] = await tx
        .update(schema.organizationInvitations)
        .set({ status: 'accepted' })
        .where(
          and(
            eq(schema.organizationInvitations.token, input.token),
            eq(schema.organizationInvitations.status, 'pending'),
            gt(schema.organizationInvitations.expiresAt, new Date()),
          ),
        )
        .returning();

      if (!invitation) {
        throw new InvitationError('Invitation token is invalid, already used, or expired');
      }

      const [user] = await tx
        .insert(schema.users)
        .values({
          email: invitation.email,
          passwordHash,
          fullName,
        })
        .returning();

      if (!user) {
        throw new Error('Failed to create invited user');
      }

      await tx.insert(schema.organizationMembers).values({
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
      });

      return { invitation, user };
    });

    const role = accepted.invitation.role as Role;
    const sessionToken = SessionService.encryptSession({
      userId: accepted.user.id,
      organizationId: accepted.invitation.organizationId,
      role,
      email: accepted.user.email,
      createdAt: Date.now(),
    });

    return {
      user: {
        id: accepted.user.id,
        email: accepted.user.email,
        fullName: accepted.user.fullName,
      },
      organization: {
        id: accepted.invitation.organizationId,
        role,
      },
      sessionToken,
    };
  }

  /**
   * Lists all members of the organization with user details and roles (Task T026).
   */
  static async listMembers(organizationId: string): Promise<MemberListItem[]> {
    const rows = await db
      .select({
        id: schema.organizationMembers.id,
        userId: schema.users.id,
        email: schema.users.email,
        fullName: schema.users.fullName,
        role: schema.organizationMembers.role,
        joinedAt: schema.organizationMembers.createdAt,
      })
      .from(schema.organizationMembers)
      .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
      .where(eq(schema.organizationMembers.organizationId, organizationId));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.email,
      fullName: row.fullName,
      role: row.role as Role,
      joinedAt: row.joinedAt.toISOString(),
    }));
  }

  /**
   * Removes a member from an organization, preventing removal of the organization owner.
   */
  static async removeMember(
    organizationId: string,
    targetUserId: string,
    _actorId?: string,
  ): Promise<boolean> {
    const [member] = await db
      .select()
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, organizationId),
          eq(schema.organizationMembers.userId, targetUserId),
        ),
      )
      .limit(1);

    if (!member) {
      return false;
    }
    if (member.role === 'owner') {
      throw new Error('Cannot remove organization owner');
    }

    const deleted = await db
      .delete(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, organizationId),
          eq(schema.organizationMembers.userId, targetUserId),
        ),
      )
      .returning({ id: schema.organizationMembers.id });

    return deleted.length > 0;
  }
}
