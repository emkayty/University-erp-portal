'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type ClearanceRecord = {
  id: string; name: string; status: string; description?: string | null;
  responsibleRole?: string; blockReason?: string | null; waivedReason?: string | null;
};

export function useStudentClearance(studentId: string) {
  return useQuery({
    queryKey: ['clearance', 'student', studentId],
    queryFn: () => apiClient.get<ClearanceRecord[]>(`/clearance/student/${studentId}`),
    enabled: Boolean(studentId),
  });
}

function refresh(qc: ReturnType<typeof useQueryClient>, studentId: string) {
  void qc.invalidateQueries({ queryKey: ['clearance', 'student', studentId] });
}

export function useClearanceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, itemId, action, reason }: { studentId: string; itemId: string; action: 'clear' | 'block' | 'waive'; reason?: string }) => {
      const path = `/clearance/student/${studentId}/item/${itemId}/${action}`;
      const body = action === 'block' ? { blockReason: reason } : action === 'waive' ? { waiverReason: reason } : undefined;
      return apiClient.patch<ClearanceRecord>(path, body);
    },
    onSuccess: (_data, variables) => refresh(qc, variables.studentId),
  });
}
