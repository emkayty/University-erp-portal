import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';

import type { RoleName } from '@uniportal/types';

// ── @Roles() ──────────────────────────────────────────────────────────────────
export const ROLES_KEY = 'roles';
/**
 * Declares which roles are allowed to access a route.
 * Used together with RolesGuard.
 *
 * @example
 *   @Roles('BURSAR', 'SUPER_ADMIN')
 *   @Get('schedules')
 *   getSchedules() {}
 */
export const Roles = (...roles: RoleName[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

// ── @StaffScopes() ─────────────────────────────────────────────────────────────
export const STAFF_SCOPES_KEY = 'staffScopes';
/**
 * Restricts a route to staff members with specific ABAC scopes.
 * Must be used in conjunction with @Roles('STAFF','SUPER_ADMIN').
 *
 * @example
 *   @Roles('STAFF','SUPER_ADMIN')
 *   @StaffScopes('finance_clerk')
 *   @Post('waivers')
 *   createWaiver() {}
 */
export const StaffScopes = (...scopes: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(STAFF_SCOPES_KEY, scopes);

// ── @Authenticated() / @SelfScoped() ─────────────────────────────────────────
// These markers document routes that are protected by the global JWT guard but
// intentionally do not use role membership as their primary policy. They do
// not replace JwtAuthGuard or service-level ownership/specialist checks.
export const AUTHENTICATED_ROUTE_KEY = 'authenticatedRoute';
export const SELF_SCOPED_ROUTE_KEY = 'selfScopedRoute';
export const Authenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_ROUTE_KEY, true);
export const SelfScoped = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SELF_SCOPED_ROUTE_KEY, true);

// ── @FeatureFlag() ────────────────────────────────────────────────────────────
export const FEATURE_FLAG_KEY = 'featureFlag';
/**
 * Requires a feature flag to be enabled before the route is accessible.
 * Returns 403 if the flag is FALSE in InstitutionSettings.
 *
 * @example
 *   @FeatureFlag('module_lms')
 *   @Get('courses')
 *   getCourses() {}
 */
export const FeatureFlag = (flagKey: string): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_FLAG_KEY, flagKey);

// ── @Public() ─────────────────────────────────────────────────────────────────
export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Marks a route as publicly accessible (no authentication required).
 * Bypasses the JwtAuthGuard.
 *
 * @example
 *   @Public()
 *   @Post('auth/login')
 *   login() {}
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

// ── @SkipRequestRlsTransaction() ───────────────────────────────────────────────
// Use only for authenticated handlers that perform slow external I/O and create
// their own explicit, short-lived transactions around database mutations.
export const SKIP_REQUEST_RLS_TRANSACTION_KEY = 'skipRequestRlsTransaction';
export const SkipRequestRlsTransaction = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_REQUEST_RLS_TRANSACTION_KEY, true);

// ── @CurrentUser() ────────────────────────────────────────────────────────────
/**
 * Parameter decorator — extracts the authenticated user from request.
 * Set by JwtAuthGuard after token verification.
 *
 * @example
 *   @Get('me')
 *   getProfile(@CurrentUser() user: JwtPayload) {}
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user: unknown }>();
    return request.user;
  },
);

// ── @RequestId() ──────────────────────────────────────────────────────────────
/**
 * Parameter decorator — extracts the X-Request-ID header.
 */
export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request.headers['x-request-id'] as string | undefined)
      ?? crypto.randomUUID();
  },
);

// ── @IdempotencyKey() ─────────────────────────────────────────────────────────
/**
 * Parameter decorator — extracts the X-Idempotency-Key header.
 * Required for POST endpoints that must be idempotent (bulk operations).
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.headers['x-idempotency-key'] as string | undefined;
  },
);
