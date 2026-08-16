'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type AdminUser = { id: string; email: string; phone?: string | null; isActive: boolean; roles?: Array<{ roleName: string; staffScope?: unknown }> };

export function useAdminUsers() {
  return useQuery({ queryKey: ['users', 'admin'], queryFn: () => apiClient.get<AdminUser[]>('/users?page=1&pageSize=100') });
}
function refresh(qc: ReturnType<typeof useQueryClient>) { void qc.invalidateQueries({ queryKey: ['users', 'admin'] }); }
export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: { email: string; password: string; roleName: string; phone?: string }) => apiClient.post<AdminUser>('/users', data), onSuccess: () => refresh(qc) });
}
export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiClient.patch(`/users/${id}/active`, { isActive }), onSuccess: () => refresh(qc) });
}
export function useGrantUserRole() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, roleName, staffScope }: { id: string; roleName: string; staffScope?: unknown }) => apiClient.post(`/users/${id}/roles`, { roleName, staffScope }), onSuccess: () => refresh(qc) });
}
export function useRevokeUserRole() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, roleName }: { id: string; roleName: string }) => apiClient.delete(`/users/${id}/roles/${roleName}`), onSuccess: () => refresh(qc) });
}
