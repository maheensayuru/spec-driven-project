import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema/index.js';
import { resetTestDatabase, testDb, testClient } from '../helpers/test-database.js';

vi.mock('../../src/db/connection.js', async () => {
  // The async import is required because Vitest hoists mock factories above static imports.
  const { testDb } = await import('../helpers/test-database.js');
  return { db: testDb };
});

import { OrganizationService } from '../../src/modules/organizations/organization.service.js';

const orgId = '77777777-7777-4777-8777-777777777777';
const otherOrgId = '88888888-8888-4888-8888-888888888888';
const ownerUserId = '11111111-1111-4111-8111-111111111111';
const memberUserId = '22222222-2222-4222-8222-222222222222';

async function seedOrganizations(): Promise<void> {
  await testClient.query(
    `INSERT INTO organizations (id, name, slug) VALUES
      ($1, 'Primary organization', 'primary-organization'),
      ($2, 'Other organization', 'other-organization')`,
    [orgId, otherOrgId],
  );
  await testClient.query(
    `INSERT INTO users (id, email, password_hash, full_name) VALUES
      ($1, 'owner@example.com', 'unused', 'Owner'),
      ($2, 'member@example.com', 'unused', 'Member')`,
    [ownerUserId, memberUserId],
  );
  await testClient.query(
    `INSERT INTO organization_members (organization_id, user_id, role) VALUES
      ($1, $2, 'owner'),
      ($3, $4, 'member')`,
    [orgId, ownerUserId, otherOrgId, memberUserId],
  );
}

describe('organization invitation persistence', () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedOrganizations();
  });

  it('persists an invitation and accepts it exactly once', async () => {
    const invitation = await OrganizationService.createInvitation(orgId, {
      email: ' NewHire@Example.com ',
      role: 'viewer',
      invitedBy: ownerUserId,
    });

    const [persisted] = await testDb
      .select()
      .from(schema.organizationInvitations)
      .where(eq(schema.organizationInvitations.id, invitation.id));
    expect(persisted?.email).toBe('newhire@example.com');
    expect(persisted?.status).toBe('pending');

    const accepted = await OrganizationService.acceptInvitation({
      token: invitation.token,
      fullName: 'New Hire',
      password: 'SecurePassword123!',
    });
    expect(accepted.organization).toEqual({ id: orgId, role: 'viewer' });

    const [membership] = await testDb
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, accepted.user.id));
    expect(membership).toMatchObject({ organizationId: orgId, role: 'viewer' });

    await expect(
      OrganizationService.acceptInvitation({
        token: invitation.token,
        fullName: 'Second Attempt',
        password: 'SecurePassword123!',
      }),
    ).rejects.toThrow('invalid, already used, or expired');
  });

  it('rolls back invitation consumption when the invited account already exists', async () => {
    const invitation = await OrganizationService.createInvitation(orgId, {
      email: 'member@example.com',
      role: 'member',
      invitedBy: ownerUserId,
    });

    await expect(
      OrganizationService.acceptInvitation({
        token: invitation.token,
        fullName: 'Duplicate Member',
        password: 'SecurePassword123!',
      }),
    ).rejects.toThrow();

    const [persisted] = await testDb
      .select()
      .from(schema.organizationInvitations)
      .where(eq(schema.organizationInvitations.id, invitation.id));
    expect(persisted?.status).toBe('pending');

    const memberships = await testDb
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, memberUserId));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.organizationId).toBe(otherOrgId);
  });

  it('keeps member listing and removal scoped to the requested organization', async () => {
    expect(await OrganizationService.listMembers(orgId)).toEqual([
      expect.objectContaining({ userId: ownerUserId, role: 'owner' }),
    ]);

    expect(await OrganizationService.removeMember(orgId, memberUserId, ownerUserId)).toBe(false);
    const otherMembers = await OrganizationService.listMembers(otherOrgId);
    expect(otherMembers).toEqual([
      expect.objectContaining({ userId: memberUserId, role: 'member' }),
    ]);

    await expect(
      OrganizationService.removeMember(orgId, ownerUserId, ownerUserId),
    ).rejects.toThrow('Cannot remove organization owner');
  });

  it('propagates invitation persistence failures', async () => {
    await expect(
      OrganizationService.createInvitation('ffffffff-ffff-4fff-8fff-ffffffffffff', {
        email: 'missing-org@example.com',
        role: 'viewer',
        invitedBy: ownerUserId,
      }),
    ).rejects.toThrow();
  });
});

