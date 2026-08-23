
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type ClearanceStatus = 'PENDING' | 'CLEARED' | 'BLOCKED' | 'WAIVED';

export type ClearanceItem = {
  id: string;
  name: string;
  description?: string | null;
  responsibleRole?: string | null;
  isRequiredForGraduation?: boolean;
  isAutoCleared?: boolean;
};

export type ClearanceRecord = {
  id?: string;
  status: ClearanceStatus;
  clearedAt?: string | null;
  blockReason?: string | null;
  waiverReason?: string | null;
  clearedById?: string | null;
  blockedById?: string | null;
  waivedById?: string | null;
};

export type StudentClearanceChecklistEntry = {
  item: ClearanceItem;
  clearance: ClearanceRecord;
};

export type StudentClearanceResponse = {
  checklist: StudentClearanceChecklistEntry[];
  administrativelyCleared: boolean;
  /** Compatibility alias retained by the API; this is not graduation eligibility. */
  eligibleForGraduation: boolean;
};

export function useStudentClearance(studentId: string) {
  return useQuery({
    queryKey: ['clearance', 'student', studentId],
    queryFn: () =>
      apiClient.get<StudentClearanceResponse>(`/clearance/student/${studentId}`),
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
