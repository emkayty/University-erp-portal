import type { RoleName, StaffScope, UserV1 } from '@uniportal/types';

/**
 * Frontend visibility helper only. The API remains the security boundary.
 * Effective roles include active assignments and approved delegations returned by /auth/me.
 */
export function effectiveRolesOf(user: UserV1 | null | undefined): RoleName[] {
  if (user?.effectiveRoles?.length) return user.effectiveRoles;
  if (user?.roles?.length) return user.roles.map((role) => role.roleName);
  return user?.primaryRole ? [user.primaryRole] : [];
}

export function effectiveScopesOf(user: UserV1 | null | undefined): StaffScope[] {
  return user?.effectiveScopes?.length ? user.effectiveScopes : user?.staffScope?.scopes ?? [];
}

export function hasEffectiveRole(user: UserV1 | null | undefined, ...roles: RoleName[]): boolean {
  const effectiveRoles = effectiveRolesOf(user);
  return roles.some((role) => effectiveRoles.includes(role));
}

export function hasEffectiveScope(user: UserV1 | null | undefined, scope: StaffScope): boolean {
  return effectiveScopesOf(user).includes(scope);
}
