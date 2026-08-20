'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export const academicKeys = {
  journey: ['academic', 'me', 'journey'] as const,
};

export function useSubmitAcademicAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { appealType: string; subjectId?: string; reason: string; evidenceRef?: string }) => apiClient.post('/academic/me/appeals', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicKeys.journey }),
  });
}

export function useRequestProgrammeTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { toProgrammeId: string; reason?: string }) => apiClient.post('/academic/me/programme-transfers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicKeys.journey }),
  });
}

export function useRequestAcademicInterruption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: string; startDate: string; endDate?: string; reason?: string }) => apiClient.post('/academic/me/interruptions', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicKeys.journey }),
  });
}
