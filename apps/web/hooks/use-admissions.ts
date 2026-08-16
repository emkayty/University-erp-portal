'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdmissionCycleV1, ApplicantV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const admissionsKeys = {
  cycles:       ['admissions', 'cycles']                           as const,
  applications: (filters?: Record<string, unknown>) => ['admissions', 'applications', filters ?? {}] as const,
  application:  (id: string) => ['admissions', 'applications', id] as const,
};

// ── Cycles ────────────────────────────────────────────────────────────────────
export function useCycles(academicYear?: string) {
  return useQuery({
    queryKey: admissionsKeys.cycles,
    queryFn:  () => apiClient.get<AdmissionCycleV1[]>(
      academicYear ? `/admissions/cycles?academicYear=${academicYear}` : '/admissions/cycles',
    ),
    staleTime: 5 * 60_000,
  });
}

export function useCreateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      academicYear: string; cycleName: string; admissionType: string;
      openDate: string; closeDate: string; utmeMinScore?: number; maxApplicants?: number;
    }) => apiClient.post<AdmissionCycleV1>('/admissions/cycles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: admissionsKeys.cycles }),
  });
}

export function useActivateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<AdmissionCycleV1>(`/admissions/cycles/${id}/activate`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: admissionsKeys.cycles }),
  });
}

// ── Applications ──────────────────────────────────────────────────────────────
export function useApplications(filters?: {
  status?: string; admissionType?: string; cycleId?: string;
  page?: number; pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status)        params.set('status',        filters.status);
  if (filters?.admissionType) params.set('admissionType', filters.admissionType);
  if (filters?.cycleId)       params.set('cycleId',       filters.cycleId);
  if (filters?.page)          params.set('page',          String(filters.page));
  if (filters?.pageSize)      params.set('pageSize',      String(filters.pageSize));

  return useQuery({
    queryKey: admissionsKeys.applications(filters),
    queryFn:  () => apiClient.get<ApplicantV1[]>(`/admissions/applications?${params.toString()}`),
    staleTime: 60_000,
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: admissionsKeys.application(id),
    queryFn:  () => apiClient.get<ApplicantV1>(`/admissions/applications/${id}`),
    enabled:  !!id,
  });
}

export function useUpdateApplicationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status: string; rejectionReason?: string; offerDeadline?: string }) =>
      apiClient.patch<ApplicantV1>(`/admissions/applications/${id}/status`, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: admissionsKeys.application(vars.id) });
      void qc.invalidateQueries({ queryKey: admissionsKeys.applications() });
    },
  });
}

export function useScreenBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { admissionCycleId: string; dryRun?: boolean }) =>
      apiClient.post<{ screened: number; rejected: number; skipped: number; dryRun: boolean }>(
        '/admissions/screen/bulk', data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: admissionsKeys.applications() }),
  });
}
