import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  Logger,
} from '@nestjs/common';
import { RoleName, DelegationStatus, Prisma } from '@prisma/client';
import Redis from 'ioredis';
import type { JwtPayload, StaffScopeAttribute, StaffScope } from '@uniportal/types';
import { REDIS_CLIENT } from '../redis/redis.module';
import { PrismaService } from '../../database/prisma.service';

const AUTHZ_CACHE_TTL_SECONDS = 30;
const authzCacheKey = (userId: string) => `authz:effective:${userId}`;

const DEFAULT_ROLE_CONFLICTS: Array<[RoleName, RoleName, string]> = [
  [RoleName.BURSAR, RoleName.REGISTRAR, 'Finance custody and academic-record authority must be separated.'],
  [RoleName.BURSAR, RoleName.HR_MANAGER, 'Finance authority and personnel master-data authority must be separated.'],
  [RoleName.REGISTRAR, RoleName.HR_MANAGER, 'Academic-record authority and personnel master-data authority must be separated.'],
];

export interface EffectiveAuthorizationContext {
  userId: string;
  roles: RoleName[];
  scopes: StaffScope[];
  staffScopes: StaffScopeAttribute[];
  delegatedRoles: Array<{ roleName: RoleName; delegationId: string; delegatorId: string; endsAt: string }>;
  evaluatedAt: string;
}

export interface RoleGrantPolicyInput {
  userId: string;
  roleName: RoleName;
  staffScope?: Record<string, unknown> | null;
  actorId: string;
}

@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getEffectiveContext(userId: string, now = new Date()): Promise<EffectiveAuthorizationContext> {
    const cached = await this.redis.get(authzCacheKey(userId));
    if (cached) return JSON.parse(cached) as EffectiveAuthorizationContext;

    const [roles, delegations] = await Promise.all([
      this.prisma.userRole.findMany({
        where: {
          userId,
          revokedAt: null,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        select: { roleName: true, staffScope: true },
      }),
      this.prisma.roleDelegation.findMany({
        where: {
          delegateeId: userId,
          status: DelegationStatus.ACTIVE,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { id: true, roleName: true, delegatorId: true, endsAt: true, staffScope: true },
      }),
    ]);

    const staffScopes = roles
      .filter((role) => role.roleName === RoleName.STAFF || role.roleName === RoleName.SUPPORT_STAFF)
      .map((role) => this.parseStaffScope(role.staffScope))
      .filter((scope): scope is StaffScopeAttribute => scope !== null);

    const delegatedStaffScopes = delegations
      .filter((delegation) => delegation.roleName === RoleName.STAFF || delegation.roleName === RoleName.SUPPORT_STAFF)
      .map((delegation) => this.parseStaffScope(delegation.staffScope))
      .filter((scope): scope is StaffScopeAttribute => scope !== null);

    const allStaffScopes = [...staffScopes, ...delegatedStaffScopes];
    const context: EffectiveAuthorizationContext = {
      userId,
      roles: [...new Set([
        ...roles.map((role) => role.roleName),
        ...delegations.map((delegation) => delegation.roleName),
      ])],
      scopes: [...new Set(allStaffScopes.flatMap((scope) => scope.scopes))],
      staffScopes: allStaffScopes,
      delegatedRoles: delegations.map((delegation) => ({
        roleName: delegation.roleName,
        delegationId: delegation.id,
        delegatorId: delegation.delegatorId,
        endsAt: delegation.endsAt.toISOString(),
      })),
      evaluatedAt: now.toISOString(),
    };

    await this.redis.setex(authzCacheKey(userId), AUTHZ_CACHE_TTL_SECONDS, JSON.stringify(context));
    return context;
  }

  async assertRouteAccess(
    user: JwtPayload,
    requiredRoles: RoleName[] | undefined,
    requiredScopes: string[] | undefined,
  ): Promise<EffectiveAuthorizationContext> {
    const context = await this.getEffectiveContext(user.sub);
    if (!requiredRoles || requiredRoles.length === 0) return context;

    const roleAllowed = requiredRoles.some((role) => context.roles.includes(role));
    if (!roleAllowed) {
      throw new ForbiddenException({
        code: 'RBAC_FORBIDDEN',
        message: `This action requires one of: ${requiredRoles.join(', ')}`,
      });
    }

    if (requiredScopes?.length) {
      const scopeAllowed = requiredScopes.some((scope) => context.scopes.includes(scope as StaffScope));
      const hasInstitutionalOverride = context.roles.some((role) =>
        role === RoleName.SUPER_ADMIN || role === RoleName.REGISTRAR || role === RoleName.VC,
      );
      if (!scopeAllowed && !hasInstitutionalOverride) {
        throw new ForbiddenException({
          code: 'RBAC_SCOPE_FORBIDDEN',
          message: `This action requires staff scope: ${requiredScopes.join(' or ')}`,
        });
      }
    }

    return context;
  }

  validateRoleAssignment(roleName: RoleName, staffScope?: Record<string, unknown> | null): void {
    this.validateScope(roleName, staffScope);
  }

  async assertRoleGrantAllowed(input: RoleGrantPolicyInput): Promise<void> {
    if (input.actorId === input.userId) {
      throw new ForbiddenException({
        code: 'AUTHZ_SELF_ROLE_GRANT',
        message: 'A user cannot grant or expand their own role assignment.',
      });
    }

    this.validateScope(input.roleName, input.staffScope);

    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { id: true, isActive: true, roles: { select: { roleName: true, revokedAt: true, effectiveUntil: true } } },
    });
    if (!target.isActive) {
      throw new ConflictException({ code: 'AUTHZ_INACTIVE_TARGET', message: 'Roles cannot be granted to an inactive account.' });
    }

    const currentRoles = target.roles
      .filter((role) => role.revokedAt === null && (!role.effectiveUntil || role.effectiveUntil > new Date()))
      .map((role) => role.roleName);
    const proposedRoles = [...new Set([...currentRoles, input.roleName])];
    const conflicts = await this.findConflicts(proposedRoles);
    if (conflicts.length) {
      throw new ConflictException({
        code: 'AUTHZ_ROLE_CONFLICT',
        message: `Role assignment conflicts with institutional separation-of-duties policy: ${conflicts.join('; ')}`,
      });
    }
  }

  async createDelegation(input: {
    delegatorId: string;
    delegateeId: string;
    roleName: RoleName;
    staffScope?: Record<string, unknown> | null;
    startsAt: Date;
    endsAt: Date;
    reason: string;
    approvedBy: string;
  }) {
    if (input.delegatorId === input.delegateeId) {
      throw new ForbiddenException({ code: 'AUTHZ_SELF_DELEGATION', message: 'A user cannot delegate authority to themselves.' });
    }
    if (input.endsAt <= input.startsAt) {
      throw new ConflictException({ code: 'AUTHZ_INVALID_DELEGATION_WINDOW', message: 'Delegation end must be after its start.' });
    }
    if (input.endsAt.getTime() - input.startsAt.getTime() > 31 * 24 * 60 * 60 * 1000) {
      throw new ConflictException({ code: 'AUTHZ_DELEGATION_TOO_LONG', message: 'Delegations may not exceed 31 days without a higher-level review.' });
    }
    this.validateScope(input.roleName, input.staffScope);
    if (input.approvedBy === input.delegateeId) {
      throw new ForbiddenException({ code: 'AUTHZ_SELF_APPROVAL', message: 'A delegatee cannot approve their own delegation.' });
    }

    const delegatorContext = await this.getEffectiveContext(input.delegatorId);
    if (!delegatorContext.roles.includes(input.roleName)) {
      throw new ForbiddenException({ code: 'AUTHZ_DELEGATOR_LACKS_ROLE', message: 'The delegator does not hold the delegated role.' });
    }
    await this.assertRoleGrantAllowed({
      userId: input.delegateeId,
      roleName: input.roleName,
      staffScope: input.staffScope,
      actorId: input.approvedBy,
    });

    const delegation = await this.prisma.roleDelegation.create({
      data: {
        delegatorId: input.delegatorId,
        delegateeId: input.delegateeId,
        roleName: input.roleName,
        staffScope: input.staffScope as Prisma.InputJsonValue | undefined,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason.trim(),
        approvedBy: input.approvedBy,
      },
    });
    await this.invalidateUser(input.delegateeId);
    return delegation;
  }

  async revokeDelegation(id: string, actorId: string) {
    const delegation = await this.prisma.roleDelegation.findUniqueOrThrow({ where: { id } });
    if (![delegation.delegatorId, delegation.approvedBy].includes(actorId)) {
      throw new ForbiddenException({ code: 'AUTHZ_DELEGATION_REVOKE_FORBIDDEN', message: 'Only the delegator or approving authority may revoke this delegation.' });
    }
    const updated = await this.prisma.roleDelegation.update({
      where: { id },
      data: { status: DelegationStatus.REVOKED, revokedAt: new Date(), revokedBy: actorId },
    });
    await this.invalidateUser(delegation.delegateeId);
    return updated;
  }

  async assertIndependentApproval(initiatorId: string, approverId: string, action: string): Promise<void> {
    if (initiatorId === approverId) {
      throw new ForbiddenException({
        code: 'AUTHZ_SELF_APPROVAL',
        message: `The initiator cannot approve the same ${action}. Independent approval is required.`,
      });
    }
  }

  resolvePrimaryRole(roles: RoleName[]): RoleName {
    const hierarchy: RoleName[] = [
      RoleName.SUPER_ADMIN, RoleName.VC, RoleName.REGISTRAR, RoleName.BURSAR,
      RoleName.HR_MANAGER, RoleName.DEAN, RoleName.HOD,
      RoleName.STAFF, RoleName.SUPPORT_STAFF, RoleName.STUDENT,
    ];
    return hierarchy.find((role) => roles.includes(role)) ?? RoleName.STUDENT;
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.redis.del(authzCacheKey(userId));
  }

  private async findConflicts(roles: RoleName[]): Promise<string[]> {
    const configured = await this.prisma.roleConflictRule.findMany({ where: { active: true } });
    const rules = configured.length
      ? configured
      : DEFAULT_ROLE_CONFLICTS.map(([roleA, roleB, reason]) => ({ roleA, roleB, reason }));
    return rules
      .filter((rule) => roles.includes(rule.roleA) && roles.includes(rule.roleB))
      .map((rule) => rule.reason);
  }

  private validateScope(roleName: RoleName, value?: Record<string, unknown> | null): void {
    if (roleName !== RoleName.STAFF && roleName !== RoleName.SUPPORT_STAFF) return;
    if (!value || !Array.isArray(value.scopes) || value.scopes.length === 0) {
      throw new ConflictException({ code: 'AUTHZ_SCOPE_REQUIRED', message: 'STAFF and SUPPORT_STAFF assignments require at least one scope.' });
    }
    const validScopes = new Set<StaffScope>([
      'admissions', 'finance_clerk', 'hr_clerk', 'lecturer', 'library', 'hostel',
      'health', 'transport', 'research', 'alumni', 'timetable', 'records',
    ]);
    if ((value.scopes as unknown[]).some((scope) => typeof scope !== 'string' || !validScopes.has(scope as StaffScope))) {
      throw new ConflictException({ code: 'AUTHZ_INVALID_SCOPE', message: 'One or more supplied authorization scopes are invalid.' });
    }
  }

  private parseStaffScope(value: unknown): StaffScopeAttribute | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as { scopes?: unknown; deptId?: unknown; facultyId?: unknown };
    if (!Array.isArray(candidate.scopes)) return null;
    return {
      scopes: candidate.scopes.filter((scope): scope is StaffScope => typeof scope === 'string') as StaffScope[],
      ...(typeof candidate.deptId === 'string' ? { deptId: candidate.deptId } : {}),
      ...(typeof candidate.facultyId === 'string' ? { facultyId: candidate.facultyId } : {}),
    };
  }
}
