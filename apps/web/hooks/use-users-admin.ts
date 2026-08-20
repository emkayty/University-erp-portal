'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoleName, StaffScope, StaffScopeAttribute } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export type AdminUserRole = {
  roleName: RoleName;
  staffScope?: StaffScopeAttribute | null;
  grantedAt?: string;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  revokedAt?: string | null;
  grantReason?: string | null;
};

export type AdminUser = {
  id: string;
  email: string;
  phone?: string | null;
  isActive: boolean;
  roles?: AdminUserRole[];
};

export type RoleAssignmentInput = {
  roleName: RoleName;
  staffScope?: StaffScopeAttribute;
  effectiveFrom?: string;
  effectiveUntil?: string;
  grantReason?: string;
};

export type Delegation = {
  id: string;
  delegatorId: string;
  delegateeId: string;
  roleName: RoleName;
  staffScope?: StaffScopeAttribute | null;
  startsAt: string;
  endsAt: string;
  reason: string;
  approvedBy: string;
  status: string;
};

export type AccessReview = {
  generatedAt: string;
  windowDays: number;
  expiringRoles: Array<{
    id: string;
    roleName: RoleName;
    effectiveUntil: string | null;
    user: { id: string; email: string; isActive: boolean };
  }>;
  revokedRolesWithSessions: Array<{
    id: string;
    roleName: RoleName;
    revokedAt: string | null;
    revokedBy?: string | null;
    user: {
      id: string;
      email: string;
      isActive: boolean;
      sessions: Array<{ id: string; createdAt: string; expiresAt: string; deviceInfo?: unknown }>;
    };
  }>;
  expiringDelegations: Array<Delegation & {
    delegator: { id: string; email: string; isActive: boolean };
    delegatee: { id: string; email: string; isActive: boolean };
  }>;
  summary: {
    expiringRoleAssignments: number;
    usersWithRevokedRolesAndActiveSessions: number;
    activeDelegationsExpiring: number;
  };
};

export const usersAdminKeys = {
  all: ['users', 'admin'] as const,
  accessReview: (windowDays: number) => ['users', 'access-review', windowDays] as const,
};

export function useAdminUsers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: usersAdminKeys.all,
    queryFn: () => apiClient.get<AdminUser[]>('/users?page=1&pageSize=200'),
    enabled: options?.enabled ?? true,
  });
}

export function useAccessReview(windowDays = 30, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: usersAdminKeys.accessReview(windowDays),
    queryFn: () => apiClient.get<AccessReview>(`/users/access-review?windowDays=${windowDays}`),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

function refresh(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: usersAdminKeys.all });
  void qc.invalidateQueries({ queryKey: ['users', 'access-review'] });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      email: string;
      password: string;
      roleName: RoleName;
      phone?: string;
      staffScope?: StaffScopeAttribute;
      effectiveFrom?: string;
      effectiveUntil?: string;
      grantReason?: string;
    }) => apiClient.post<AdminUser>('/users', data),
    onSuccess: () => refresh(qc),
  });
}

export function useRevokeUserSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.post<{ revokedCount: number }>(`/auth/revoke/${userId}`),
    onSuccess: () => refresh(qc),
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiClient.patch(`/users/${id}/active`, { isActive }),
    onSuccess: () => refresh(qc),
  });
}

export function useGrantUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & RoleAssignmentInput) => apiClient.post(`/users/${id}/roles`, data),
    onSuccess: () => refresh(qc),
  });
}

export function useRevokeUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleName }: { id: string; roleName: RoleName }) => apiClient.delete(`/users/${id}/roles/${roleName}`),
    onSuccess: () => refresh(qc),
  });
}

export function useCreateDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ delegateeId, ...data }: {
      delegateeId: string;
      roleName: RoleName;
      startsAt: string;
      endsAt: string;
      reason: string;
      staffScope?: StaffScopeAttribute;
    }) => apiClient.post<Delegation>(`/users/${delegateeId}/delegations`, data),
    onSuccess: () => refresh(qc),
  });
}

export function useRevokeDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ delegateeId, delegationId }: { delegateeId: string; delegationId: string }) => apiClient.delete<Delegation>(`/users/${delegateeId}/delegations/${delegationId}`),
    onSuccess: () => refresh(qc),
  });
}

export const ALL_ROLE_NAMES: RoleName[] = [
  'SUPER_ADMIN', 'VC', 'REGISTRAR', 'DEAN', 'HOD', 'STAFF',
  'SUPPORT_STAFF', 'BURSAR', 'HR_MANAGER', 'STUDENT',
];

export const ALL_STAFF_SCOPES: StaffScope[] = [
  'admissions', 'admissions_corrections', 'finance_clerk', 'hr_clerk', 'lecturer', 'library', 'hostel',
  'health', 'transport', 'research', 'alumni', 'timetable', 'records', 'dpo',
];
