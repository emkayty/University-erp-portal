import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import type { JwtPayload, RoleName } from '@uniportal/types';
import { IS_PUBLIC_KEY, ROLES_KEY, STAFF_SCOPES_KEY } from '../decorators';
import { AuthorizationService } from '../authorization/authorization.service';

/**
 * Central RBAC/ABAC route guard.
 *
 * JwtAuthGuard validates the signed token first. This guard then resolves the
 * effective roles and delegations from the database/short Redis cache, so role
 * grants, expiry, revocation, and delegation take effect without waiting for
 * access-token expiry. Resource-level checks remain in domain authorization
 * services such as AcademicOfferingAuthorizationService.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(STAFF_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Routes without @Roles still require authentication through JwtAuthGuard,
    // but do not impose an additional role restriction here.
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Authentication required' });
    }

    await this.authorization.assertRouteAccess(user, requiredRoles, requiredScopes);
    return true;
  }
}
