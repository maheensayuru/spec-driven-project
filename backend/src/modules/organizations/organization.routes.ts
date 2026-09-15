import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { InvitationError, OrganizationService } from './organization.service.js';
import { requirePermission } from '../auth/rbac.service.js';
import { AuthenticatedRequest } from '../../server.js';

const InviteRequestSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']),
});

const AcceptInviteRequestSchema = z.object({
  token: z.string().min(10),
  fullName: z.string().min(2).max(255),
  password: z.string().min(8).max(128),
});

const MemberParamSchema = z.object({
  userId: z.string(),
});

export async function organizationRoutes(server: FastifyInstance): Promise<void> {
  // Public endpoint: Accept an invitation
  server.post('/invitations/accept', async (request: FastifyRequest, reply: FastifyReply) => {
    const input = AcceptInviteRequestSchema.parse(request.body);

    try {
      const result = await OrganizationService.acceptInvitation(input);

      reply.setCookie('rr_session', result.sessionToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      });

      return reply.status(200).send({
        user: result.user,
        organization: result.organization,
      });
    } catch (err) {
      if (!(err instanceof InvitationError)) throw err;
      const message = err.message;
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message,
      });
    }
  });

  // Protected: Create an invitation (requires org:invite permission)
  server.post(
    '/invitations',
    { preHandler: [requirePermission('org:invite')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authReq = request as AuthenticatedRequest;
      const input = InviteRequestSchema.parse(request.body);

      const record = await OrganizationService.createInvitation(authReq.session!.organizationId, {
        email: input.email,
        role: input.role,
        invitedBy: authReq.session!.userId,
      });

      return reply.status(201).send({
        id: record.id,
        email: record.email,
        role: record.role,
        token: record.token,
        expiresAt: record.expiresAt.toISOString(),
      });
    },
  );

  // Protected: List organization members (requires members:read permission)
  server.get(
    '/members',
    { preHandler: [requirePermission('members:read')] },
    async (request: FastifyRequest) => {
      const authReq = request as AuthenticatedRequest;

      const members = await OrganizationService.listMembers(authReq.session!.organizationId);

      return {
        items: members,
        total: members.length,
      };
    },
  );

  // Protected: Remove a member (requires members:remove permission)
  server.delete(
    '/members/:userId',
    { preHandler: [requirePermission('members:remove')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authReq = request as AuthenticatedRequest;
      const { userId } = MemberParamSchema.parse(request.params);

      try {
        await OrganizationService.removeMember(
          authReq.session!.organizationId,
          userId,
          authReq.session!.userId,
        );
        return reply.status(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove member';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    },
  );
}
