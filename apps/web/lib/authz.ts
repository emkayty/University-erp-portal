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

export function hasEffectiveAnyRole(
  user: UserV1 | null | undefined,
  roles: readonly RoleName[],
): boolean {
  const effectiveRoles = effectiveRolesOf(user);
  return roles.some((role) => effectiveRoles.includes(role));
}

/**
 * Frontend capability map for Payroll presentation only.
 * The API controller remains the security boundary and must enforce the same contract.
 */
export const MODULE_ACCESS = {
  payroll: {
    navigationRoles: ['SUPER_ADMIN', 'REGISTRAR', 'BURSAR', 'HR_MANAGER', 'STAFF'] as const,
    viewRuns: ['BURSAR', 'HR_MANAGER', 'REGISTRAR', 'SUPER_ADMIN'] as const,
    viewRunPayslips: ['BURSAR', 'HR_MANAGER', 'SUPER_ADMIN'] as const,
    manage: ['BURSAR', 'HR_MANAGER', 'SUPER_ADMIN'] as const,
    ownPayslips: ['STAFF'] as const,
  },
} as const;
