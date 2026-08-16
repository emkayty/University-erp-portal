'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type SecurityIncident = {
  id: string; type: string; description: string; status: string; affectedUserIds: string[];
  detectedAt: string; containedAt?: string | null; nitdaNotifiedAt?: string | null; resolvedAt?: string | null;
};

export function useSecurityIncidents() {
  return useQuery({ queryKey: ['security', 'incidents'], queryFn: () => apiClient.get<SecurityIncident[]>('/security/incidents') });
}

function refresh(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['security', 'incidents'] });
}

export function useCreateSecurityIncident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: { type: string; description: string; affectedUserIds: string[] }) => apiClient.post<SecurityIncident>('/security/incidents', data), onSuccess: () => refresh(qc) });
}
export function useSecurityIncidentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, dpoNotes }: { id: string; action: 'contain' | 'nitda-notified' | 'resolve'; dpoNotes?: string }) => apiClient.patch<SecurityIncident>(`/security/incidents/${id}/${action}`, action === 'resolve' ? { dpoNotes } : undefined),
    onSuccess: () => refresh(qc),
  });
}
