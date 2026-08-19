import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RoleName, DelegationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';

function makeHarness() {
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  } as any;
  const prisma = {
    userRole: { findMany: jest.fn().mockResolvedValue([]) },
    roleDelegation: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    roleConflictRule: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
  } as any;
  return { redis, prisma, service: new AuthorizationService(prisma, redis) };
}

describe('AuthorizationService', () => {
  it('resolves active roles and delegated scopes into an effective context', async () => {
    const h = makeHarness();
    h.prisma.userRole.findMany.mockResolvedValue([
      { roleName: RoleName.STAFF, staffScope: { scopes: ['admissions'], deptId: 'dept-1' } },
    ]);
    h.prisma.roleDelegation.findMany.mockResolvedValue([
      { id: 'del-1', roleName: RoleName.REGISTRAR, delegatorId: 'reg-1', endsAt: new Date('2026-08-30T00:00:00.000Z'), staffScope: null },
    ]);

    const context = await h.service.getEffectiveContext('user-1', new Date('2026-08-19T00:00:00.000Z'));

    expect(context.roles).toEqual([RoleName.STAFF, RoleName.REGISTRAR]);
    expect(context.scopes).toEqual(['admissions']);
    expect(context.delegatedRoles[0]).toEqual(expect.objectContaining({ delegationId: 'del-1', roleName: RoleName.REGISTRAR }));
    expect(h.redis.setex).toHaveBeenCalled();
  });

  it('allows a route when an effective delegated role matches', async () => {
    const h = makeHarness();
    h.prisma.userRole.findMany.mockResolvedValue([]);
    h.prisma.roleDelegation.findMany.mockResolvedValue([
      { id: 'del-1', roleName: RoleName.REGISTRAR, delegatorId: 'reg-1', endsAt: new Date('2026-08-30T00:00:00.000Z'), staffScope: null },
    ]);

    await expect(h.service.assertRouteAccess(
      { sub: 'user-1' } as any,
      [RoleName.REGISTRAR],
      undefined,
    )).resolves.toBeDefined();
  });

  it('rejects self role grants', async () => {
    const h = makeHarness();
    await expect(h.service.assertRoleGrantAllowed({
      userId: 'same-user', actorId: 'same-user', roleName: RoleName.BURSAR,
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects incompatible role combinations', async () => {
    const h = makeHarness();
    h.prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'target', isActive: true,
      roles: [{ roleName: RoleName.BURSAR, revokedAt: null, effectiveUntil: null }],
    });

    await expect(h.service.assertRoleGrantAllowed({
      userId: 'target', actorId: 'admin', roleName: RoleName.REGISTRAR,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unscoped staff assignments', async () => {
    const h = makeHarness();
    h.prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'target', isActive: true, roles: [] });

    await expect(h.service.assertRoleGrantAllowed({
      userId: 'target', actorId: 'admin', roleName: RoleName.STAFF,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts an explicitly scoped DPO assignment', () => {
    const h = makeHarness();
    expect(() => h.service.validateRoleAssignment(RoleName.STAFF, { scopes: ['dpo'] })).not.toThrow();
  });

  it('rejects delegations longer than 31 days', async () => {
    const h = makeHarness();
    await expect(h.service.createDelegation({
      delegatorId: 'delegator', delegateeId: 'delegatee', approvedBy: 'approver',
      roleName: RoleName.REGISTRAR,
      startsAt: new Date('2026-08-01T00:00:00.000Z'),
      endsAt: new Date('2026-10-01T00:00:00.000Z'),
      reason: 'Temporary approved acting appointment',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(h.prisma.roleDelegation.create).not.toHaveBeenCalled();
  });
});
