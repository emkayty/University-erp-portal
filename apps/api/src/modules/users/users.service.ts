import {
  BadRequestException, ConflictException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, RoleName } from '@prisma/client';
import Redis from 'ioredis';

import { buildAdvisoryLockKey } from '@uniportal/utils';

import { AuditService } from '../../common/audit/audit.service';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { PrismaService } from '../../database/prisma.service';
import { DirectPrismaService } from '../../database/direct-prisma.service';
import { PasswordService } from '../auth/services/password.service';

const userStatusKey = (id: string) => `user:status:${id}`;

export interface CreateUserInput {
  email: string; password: string; phone?: string;
  roleName: RoleName; staffScope?: Record<string, unknown>; grantedBy: string;
}

@Injectable()
export class UsersService {
  private readonly MAX_SUPER_ADMINS = 2;

  constructor(
    private readonly prisma:    PrismaService,
    private readonly direct:    DirectPrismaService,
    private readonly passwords: PasswordService,
    private readonly audit:     AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async createUser(input: CreateUserInput) {
    const strength = this.passwords.validatePasswordStrength(input.password);
    if (strength) throw new BadRequestException(strength);
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'Email already registered' });

    const hash = await this.passwords.hash(input.password);
    const data = {
      email: input.email.toLowerCase(), phone: input.phone ?? null,
      passwordHash: hash, isActive: true,
      roles: { create: { roleName: input.roleName, staffScope: input.staffScope as Prisma.InputJsonValue | undefined, grantedBy: input.grantedBy } },
    };
    const user = input.roleName === RoleName.SUPER_ADMIN
      ? await this.direct.$transaction(async (tx) => {
        await this.assertSuperAdminCap(tx);
        return tx.user.create({ data, include: { roles: true } });
      })
      : await this.prisma.user.create({ data, include: { roles: true } });
    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'users', targetId: user.id,
      newValues: { email: user.email, roleName: input.roleName },
    }, input.grantedBy);
    return user;
  }

  async findAll(filters: { roleFilter?: RoleName; isActive?: boolean; page: number; pageSize: number }) {
    const { roleFilter, isActive, page, pageSize } = filters;
    const skip  = (page - 1) * pageSize;
    const where = {
      ...(isActive !== undefined ? { isActive } : {}),
      ...(roleFilter ? { roles: { some: { roleName: roleFilter } } } : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, include: { roles: true }, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);
    return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id }, include: { roles: true } });
  }

  async grantRole(input: { userId: string; roleName: RoleName; staffScope?: Record<string, unknown>; actorId: string }) {
    const applyGrant = async (tx: Prisma.TransactionClient) => {
      const existing = await tx.userRole.findUnique({
        where: { uq_user_role: { userId: input.userId, roleName: input.roleName } },
      });
      if (input.roleName === RoleName.SUPER_ADMIN && !existing) await this.assertSuperAdminCap(tx);
      if (existing) {
        await tx.userRole.update({
          where: { uq_user_role: { userId: input.userId, roleName: input.roleName } },
          data:  { staffScope: input.staffScope as Prisma.InputJsonValue | undefined, grantedBy: input.actorId },
        });
      } else {
        await tx.userRole.create({
          data: { userId: input.userId, roleName: input.roleName, staffScope: input.staffScope as Prisma.InputJsonValue | undefined, grantedBy: input.actorId },
        });
      }
    };
    if (input.roleName === RoleName.SUPER_ADMIN) await this.direct.$transaction(applyGrant);
    else await applyGrant(this.prisma as unknown as Prisma.TransactionClient);

    await this.audit.log({
      action: AuditAction.ROLE_GRANTED, targetTable: 'user_roles', targetId: input.userId,
      newValues: { roleName: input.roleName },
    }, input.actorId);
  }

  async revokeRole(userId: string, roleName: RoleName, actorId: string) {
    const role = await this.prisma.userRole.findUnique({
      where: { uq_user_role: { userId, roleName } },
    });
    if (!role) throw new NotFoundException('Role not assigned to this user');
    if (roleName === RoleName.SUPER_ADMIN) {
      // Deep-audit fix (Aug 2026): this previously counted UserRole rows
      // regardless of whether the holding User was isActive. If one of
      // two SUPER_ADMIN holders had been deactivated (offboarded — a
      // normal event that deactivates the account without necessarily
      // also revoking every role row), the count still read 2, and this
      // would let the sole remaining ACTIVE SUPER_ADMIN's role be revoked
      // too — a full, unrecoverable lockout with no path back through the
      // API. Now counts only active holders.
      const count = await this.prisma.userRole.count({
        where: { roleName: RoleName.SUPER_ADMIN, user: { isActive: true } },
      });
      if (count <= 1) throw new BadRequestException('Cannot revoke the last active SUPER_ADMIN role');
    }
    await this.prisma.userRole.delete({ where: { uq_user_role: { userId, roleName } } });
    await this.audit.log({
      action: AuditAction.ROLE_REVOKED, targetTable: 'user_roles', targetId: userId,
      oldValues: { roleName },
    }, actorId);
  }

  async setActive(userId: string, isActive: boolean, actorId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.prisma.user.update({ where: { id: userId }, data: { isActive } });
    // H2: Invalidate JWT strategy Redis cache — deactivation takes effect on next request
    await this.redis.del(userStatusKey(userId));
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'users', targetId: userId,
      oldValues: { isActive: user.isActive }, newValues: { isActive },
    }, actorId);
  }

  /**
   * Deep-audit fix (Aug 2026): the cap lock and the SUPER_ADMIN user/role
   * write now execute in one direct PostgreSQL transaction. Two concurrent
   * grants therefore serialize the count-and-write sequence, while ordinary
   * non-SUPER_ADMIN user and role operations retain their existing request
   * client path.
   */
  private async assertSuperAdminCap(tx: Prisma.TransactionClient) {
    const lockKey = buildAdvisoryLockKey('super-admin-cap');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;
    const count = await tx.userRole.count({ where: { roleName: RoleName.SUPER_ADMIN } });
    if (count >= this.MAX_SUPER_ADMINS) {
      throw new BadRequestException(`Maximum ${this.MAX_SUPER_ADMINS} SUPER_ADMIN accounts allowed`);
    }
  }
}
