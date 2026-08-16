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
    userRole: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  } as any;
  const passwords = {
    validatePasswordStrength: jest.fn().mockReturnValue(undefined),
    hash: jest.fn().mockResolvedValue('hashed'),
  } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const redis = { del: jest.fn() } as any;
  return { tx, direct, prisma, passwords, audit, redis, service: new UsersService(prisma, direct, passwords, audit, redis) };
}

describe('UsersService super-admin cap transaction', () => {
  it('locks, counts, and creates a super-admin in one direct transaction', async () => {
    const h = makeHarness(1);

    await h.service.createUser({ email: 'new@test.com', password: 'StrongPassword!123', roleName: RoleName.SUPER_ADMIN, grantedBy: 'actor-1' });

    expect(h.direct.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(h.tx.userRole.count).toHaveBeenCalledWith({ where: { roleName: RoleName.SUPER_ADMIN } });
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
});
