'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type DeadLetterEventV1 = {
  id: string;
  eventType: string;
  createdAt: string;
  deadLetteredAt: string | null;
  attempts: number;
  lastError: string | null;
};

const reliabilityKeys = {
  deadLetters: ['reliability', 'dead-letters'] as const,
};

export function useDeadLetters(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: reliabilityKeys.deadLetters,
    queryFn: () => apiClient.get<{ events: DeadLetterEventV1[] }>('/reliability/dead-letters?limit=100'),
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useReplayDeadLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ id: string; eventType: string; status: 'QUEUED_FOR_REPLAY' }>(`/reliability/dead-letters/${id}/replay`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reliabilityKeys.deadLetters }),
  });
}

