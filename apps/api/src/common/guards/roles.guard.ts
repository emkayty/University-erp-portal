import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import type { JwtPayload, RoleName, StaffScopeAttribute } from '@uniportal/types';

import { IS_PUBLIC_KEY, ROLES_KEY, STAFF_SCOPES_KEY } from '../decorators';

/**
 * RolesGuard implements both RBAC and ABAC enforcement:
 *
 * RBAC: Checks req.user.role against @Roles() decorator
 * ABAC: For STAFF role, additionally checks staffScope.scopes against @StaffScopes()
 *
 * This guard MUST run after JwtAuthGuard (which sets req.user).
 *
 * Deep-audit fix (Aug 2026): this docblock previously read "Applied
 * globally in P1 — for now it's a no-op stub", describing Phase-1
 * behavior that was superseded long before this comment was updated to
 * say so — the implementation below has been a complete, non-stub
 * RBAC+ABAC guard for some time. It is NOT applied globally; it must be
 * added via @UseGuards(RolesGuard) on each controller that needs it
 * (17 of 26 controllers had it before this pass; the remaining 9 —
 * research, alumni, search, audit-viewer, clinic, transport, reports,
 * privacy, security — are wired up in this same pass. See
 * docs/CHANGELOG.md, finding 1.2, for the full account of
 * what that gap meant in practice.)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Get required roles from @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator — route allows any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user    = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'RBAC_FORBIDDEN',
        message: 'Authentication required',
      });
    }

    // SUPER_ADMIN is explicit, not a universal business-rule bypass. Controllers
    // must declare it in @Roles(); sensitive business actions still enforce SoD.

    // Check primary role
    const roleAllowed = requiredRoles.includes(user.role);
    if (!roleAllowed) {
      this.logger.warn(
        `Access denied: user ${user.sub} (role: ${user.role}) attempted ${requiredRoles.join('|')} route`,
      );
      throw new ForbiddenException({
        code: 'RBAC_FORBIDDEN',
        message: `This action requires one of: ${requiredRoles.join(', ')}`,
      });
    }

    // ABAC: For STAFF role — check staffScope if @StaffScopes() is declared
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(STAFF_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredScopes && requiredScopes.length > 0 && user.role === 'STAFF') {
      const userScopes = (user.staffScope as StaffScopeAttribute | null)?.scopes ?? [];
      const scopeAllowed = requiredScopes.some((s) => userScopes.includes(s as never));

      if (!scopeAllowed) {
        this.logger.warn(
          `ABAC denied: user ${user.sub} scopes [${userScopes.join(',')}] ` +
          `vs required [${requiredScopes.join(',')}]`,
        );
        throw new ForbiddenException({
          code: 'RBAC_SCOPE_FORBIDDEN',
          message: `This action requires staff scope: ${requiredScopes.join(' or ')}`,
        });
      }
    }

    return true;
  }
}
