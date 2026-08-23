import { BadRequestException } from '@nestjs/common';
import { RoleName } from '@prisma/client';

import { UsersService } from './users.service';

function makeHarness(count = 1) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    user: { create: jest.fn().mockResolvedValue({ id: 'user-new', email: 'new@test.com', roles: [{ roleName: RoleName.SUPER_ADMIN }] }) },
    userRole: {
      count: jest.fn().mockResolvedValue(count),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
  const direct = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) } as any;
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    userRole: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    roleDelegation: { findMany: jest.fn() },
  } as any;
  const passwords = {
    validatePasswordStrength: jest.fn().mockReturnValue(undefined),
    hash: jest.fn().mockResolvedValue('hashed'),
  } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const redis = { del: jest.fn() } as any;
  return { tx, direct, prisma, passwords, audit, redis, service: new UsersService(prisma, direct, passwords, audit, redis) };
}

describe('UsersService access review', () => {
  it('returns the three governance review buckets and caps the window at 90 days', async () => {
    const h = makeHarness();
    const expiringRole = { id: 'role-1', roleName: RoleName.BURSAR, effectiveUntil: new Date(), user: { id: 'user-1', email: 'bursar@test.com', isActive: true } };
    const revokedRole = { id: 'role-2', roleName: RoleName.STAFF, revokedAt: new Date(), user: { id: 'user-2', email: 'staff@test.com', isActive: true, sessions: [{ id: 'session-1', createdAt: new Date(), expiresAt: new Date(), deviceInfo: null }] } };
    const delegation = { id: 'delegation-1', roleName: RoleName.REGISTRAR, endsAt: new Date(), delegator: { id: 'user-3', email: 'registrar@test.com', isActive: true }, delegatee: { id: 'user-4', email: 'delegatee@test.com', isActive: true } };
    h.prisma.userRole.findMany
      .mockResolvedValueOnce([expiringRole])
      .mockResolvedValueOnce([revokedRole]);
    h.prisma.roleDelegation.findMany.mockResolvedValueOnce([delegation]);

    const result = await h.service.getAccessReview(180);

    expect(result.windowDays).toBe(90);
    expect(result.summary).toEqual({
      expiringRoleAssignments: 1,
      usersWithRevokedRolesAndActiveSessions: 1,
      activeDelegationsExpiring: 1,
    });
    expect(result.expiringRoles).toEqual([expiringRole]);
    expect(result.revokedRolesWithSessions).toEqual([revokedRole]);
    expect(result.expiringDelegations).toEqual([delegation]);
    expect(h.prisma.userRole.findMany).toHaveBeenCalledTimes(2);
    expect(h.prisma.roleDelegation.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('UsersService super-admin cap transaction', () => {
  it('locks, counts, and creates a super-admin in one direct transaction', async () => {
    const h = makeHarness(1);

    await h.service.createUser({ email: 'new@test.com', password: 'StrongPassword!123', roleName: RoleName.SUPER_ADMIN, grantedBy: 'actor-1' });

    expect(h.direct.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(h.tx.userRole.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        roleName: RoleName.SUPER_ADMIN,
        revokedAt: null,
        user: { isActive: true },
      }),
    });
    expect(h.tx.user.create).toHaveBeenCalled();
    expect(h.prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects a full cap before creating the super-admin', async () => {
    const h = makeHarness(2);

    await expect(h.service.createUser({ email: 'new@test.com', password: 'StrongPassword!123', roleName: RoleName.SUPER_ADMIN, grantedBy: 'actor-1' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(h.tx.user.create).not.toHaveBeenCalled();
  });

  it('locks, counts, and grants a new super-admin role in one transaction', async () => {
    const h = makeHarness(1);

    await h.service.grantRole({ userId: 'user-2', roleName: RoleName.SUPER_ADMIN, actorId: 'actor-1' });

    expect(h.direct.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.userRole.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'user-2', roleName: RoleName.SUPER_ADMIN }) }));
  });

  it('invalidates the target authorization cache after a successful role grant', async () => {
    const h = makeHarness(1);
    const invalidateUser = jest.fn().mockResolvedValue(undefined);
    (h.service as any).authorization = {
      assertRoleGrantAllowed: jest.fn().mockResolvedValue(undefined),
      invalidateUser,
    };

    await h.service.grantRole({ userId: 'user-2', roleName: RoleName.SUPER_ADMIN, actorId: 'actor-1' });

    expect(invalidateUser).toHaveBeenCalledWith('user-2');
  });
});
