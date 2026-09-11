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
  | 'audit:read'
  | 'members:read'
  | 'members:update_role'
  | 'members:remove';

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
    'members:read',
    'members:update_role',
    'members:remove',
  ],
  admin: [
    'obligations:read',
    'obligations:create',
    'obligations:update',
    'obligations:delete',
    'org:invite',
    'audit:read',
    'members:read',
    'members:update_role',
    'members:remove',
  ],
  member: ['obligations:read', 'obligations:create', 'obligations:update', 'members:read'],
  viewer: ['obligations:read', 'members:read'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    return false;
  }
  return permissions.includes(permission);
}

/**
 * Fastify preHandler hook that enforces role-based permission requirements (FR-003 & Task T025).
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

/**
 * Fastify preHandler hook requiring one of the specified roles.
 */
export function requireRole(...allowedRoles: Role[]) {
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

    if (!allowedRoles.includes(session.role)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Access denied for role '${session.role}'`,
      });
    }
  };
}
