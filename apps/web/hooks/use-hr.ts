'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeaveRequestV1, SalaryGradeV1, StaffV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const hrKeys = {
  grades: ['hr', 'grades'] as const,
  staff:  (f?: Record<string, unknown>) => ['hr', 'staff', f ?? {}] as const,
  leave:  ['hr', 'leave', 'pending'] as const,
};

export function useSalaryGrades() {
  return useQuery({
    queryKey: hrKeys.grades,
    queryFn:  () => apiClient.get<SalaryGradeV1[]>('/hr/salary-grades'),
    staleTime: 10 * 60_000,
  });
}

export function useStaff(filters?: { departmentId?: string; employmentStatus?: string; page?: number }) {
  const p = new URLSearchParams();
  if (filters?.departmentId)     p.set('departmentId',     filters.departmentId);
  if (filters?.employmentStatus) p.set('employmentStatus', filters.employmentStatus);
  if (filters?.page)             p.set('page',             String(filters.page));
  return useQuery({
    queryKey: hrKeys.staff(filters),
    queryFn:  () => apiClient.get<StaffV1[]>(`/hr/staff?${p.toString()}`),
    staleTime: 60_000,
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post<StaffV1>('/hr/staff', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: hrKeys.staff() }),
  });
}

export function useRetireStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (staffId: string) => apiClient.patch<StaffV1>(`/hr/staff/${staffId}/retire`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.staff() }),
  });
}

export function useCreateSalaryGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { gradeLevel: string; basicSalary: number; housingAllowancePct?: number; transportAllowancePct?: number; medicalAllowancePct?: number }) =>
      apiClient.post<SalaryGradeV1>('/hr/salary-grades', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.grades }),
  });
}

export function usePendingLeaves(departmentId?: string) {
  return useQuery({
    queryKey: hrKeys.leave,
    queryFn:  () => apiClient.get<LeaveRequestV1[]>(`/hr/leave/pending${departmentId ? `?departmentId=${departmentId}` : ''}`),
    staleTime: 30_000,
  });
}

export function useRequestLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { leaveType: string; startDate: string; endDate: string; reason: string }) =>
      apiClient.post<LeaveRequestV1>('/hr/leave/request', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: hrKeys.leave }),
  });
}

export function useDecideLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: string; note?: string }) =>
      apiClient.patch<LeaveRequestV1>(`/hr/leave/${id}/decide`, { action, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.leave }),
  });
}
