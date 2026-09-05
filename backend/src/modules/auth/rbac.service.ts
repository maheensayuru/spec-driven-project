import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from '../../server.js';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export type Permission =
  | 'obligations:read'
  | 'obligations:create'
  | 'obligations:update'
  | 'obligations:delete'
  | 'org:invite'
  | 'org:manage_billing'
  | 'org:delete'
  | 'audit:read';

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    'obligations:read',
    'obligations:create',
    'obligations:update',
    'obligations:delete',
    'org:invite',
    'org:manage_billing',
    'org:delete',
    'audit:read',
  ],
  admin: [
    'obligations:read',
    'obligations:create',
    'obligations:update',
    'obligations:delete',
    'org:invite',
    'audit:read',
  ],
  member: [
    'obligations:read',
    'obligations:create',
    'obligations:update',
  ],
  viewer: [
    'obligations:read',
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    return false;
  }
  return permissions.includes(permission);
}

/**
 * Fastify preHandler hook that enforces role-based permission requirements.
 */
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const session = authReq.session;

    if (!session) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication session required',
      });
    }

    if (!hasPermission(session.role, permission)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Insufficient permissions: role '${session.role}' lacks '${permission}'`,
      });
    }
  };
}
