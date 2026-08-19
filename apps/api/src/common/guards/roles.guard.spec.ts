import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

function makeContext(metadata: { roles?: string[]; scopes?: string[]; public?: boolean }, user?: unknown) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'roles') return metadata.roles;
      if (key === 'staffScopes') return metadata.scopes;
      return metadata.public;
    }),
  } as any;
  const authorization = { assertRouteAccess: jest.fn().mockResolvedValue({ roles: metadata.roles ?? [] }) } as any;
  const request = { user };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({ getRequest: () => request })),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector, authorization), authorization, context };
}

describe('RolesGuard', () => {
  it('delegates role and scope evaluation to centralized authorization', async () => {
    const h = makeContext({ roles: ['REGISTRAR'], scopes: ['records'] }, { sub: 'user-1' });

    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.authorization.assertRouteAccess).toHaveBeenCalledWith(
      { sub: 'user-1' }, ['REGISTRAR'], ['records'],
    );
  });

  it('does not query authorization for public routes', async () => {
    const h = makeContext({ public: true }, undefined);
    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.authorization.assertRouteAccess).not.toHaveBeenCalled();
  });

  it('rejects a role-protected route without an authenticated request user', async () => {
    const h = makeContext({ roles: ['SUPER_ADMIN'] }, undefined);
    await expect(h.guard.canActivate(h.context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delegates scope-only routes instead of treating them as authenticated-only', async () => {
    const h = makeContext({ scopes: ['health'] }, { sub: 'user-1' });

    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.authorization.assertRouteAccess).toHaveBeenCalledWith(
      { sub: 'user-1' }, undefined, ['health'],
    );
  });

  it('rejects a scope-only route without an authenticated request user', async () => {
    const h = makeContext({ scopes: ['research'] }, undefined);
    await expect(h.guard.canActivate(h.context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.authorization.assertRouteAccess).not.toHaveBeenCalled();
  });
});
