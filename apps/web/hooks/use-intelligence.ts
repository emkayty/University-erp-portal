'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type IntelligenceAlert = {
  id: string; severity: string; status: string; domain: string; title: string;
  message: string; assignedToId?: string | null; createdAt: string;
};
export type IntelligenceTask = {
  id: string; code: string; title: string; description?: string | null; domain: string;
  status: string; assignedToId?: string | null; dueAt?: string | null;
};

const keys = {
  alerts: (status?: string) => ['intelligence', 'alerts', status ?? 'all'] as const,
  tasks: (status?: string) => ['intelligence', 'tasks', status ?? 'all'] as const,
};

export function useIntelligenceAlerts(status?: string) {
  return useQuery({
    queryKey: keys.alerts(status),
    queryFn: () => apiClient.get<IntelligenceAlert[]>(`/intelligence/alerts${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    refetchInterval: 30_000,
  });
}

export function useIntelligenceTasks(status?: string) {
  return useQuery({
    queryKey: keys.tasks(status),
    queryFn: () => apiClient.get<IntelligenceTask[]>(`/intelligence/tasks${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    refetchInterval: 30_000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['intelligence'] });
}

export function useClaimTask() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiClient.post<IntelligenceTask>(`/intelligence/tasks/${id}/claim`), onSuccess: () => invalidate(qc) });
}
export function useAssignTask() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) => apiClient.patch<IntelligenceTask>(`/intelligence/tasks/${id}/assign`, { assigneeId }), onSuccess: () => invalidate(qc) });
}
export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) => apiClient.patch<IntelligenceTask>(`/intelligence/tasks/${id}/status`, { status, note }), onSuccess: () => invalidate(qc) });
}
export function useAlertAction() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, action }: { id: string; action: 'acknowledge' | 'resolve' | 'dismiss' }) => apiClient.patch<IntelligenceAlert>(`/intelligence/alerts/${id}/${action}`), onSuccess: () => invalidate(qc) });
}
