'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type AssessmentGradebook = {
  scheme: { id: string; name: string; status: string; components: Array<{ id: string; code: string; name: string; maxScore: number; weight: number }> };
  rows: Array<{ student: { id: string; matricNo: string; firstName: string; lastName: string }; marks: Array<{ componentId: string; score: number }>; finalScore: number; complete: boolean }>;
  summary: { total: number; complete: number; incomplete: number };
};

export function useAssessmentGradebook(courseOfferingId: string) {
  return useQuery({
    queryKey: ['assessment', 'gradebook', courseOfferingId],
    queryFn: () => apiClient.get<AssessmentGradebook>(`/assessment/offerings/${courseOfferingId}/gradebook`),
    enabled: Boolean(courseOfferingId),
  });
}

export function useGenerateDraftResults() {
  return useMutation({ mutationFn: (courseOfferingId: string) => apiClient.post<{ generated: number; skipped: number }>(`/assessment/offerings/${courseOfferingId}/generate-results`) });
}

export function useAssessmentExport() {
  return useMutation({ mutationFn: (courseOfferingId: string) => apiClient.download(`/assessment/offerings/${courseOfferingId}/export`) });
}
