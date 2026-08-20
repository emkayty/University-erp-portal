'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GrantV1, MemberRole, ResearchOutputV1, ResearchProjectV1, ResearchSummaryV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const researchKeys = {
  projects:  (f?: Record<string,string>) => ['research', 'projects', f ?? {}] as const,
  project:   (id: string) => ['research', 'projects', id] as const,
  summary:   ['research', 'summary'] as const,
  people:    ['research', 'people'] as const,
};

export type ResearchPerson = { userId: string; employeeNo: string; firstName: string; lastName: string; designation: string; departmentId: string };

export function useResearchPeople(enabled = true) {
  return useQuery({
    queryKey: researchKeys.people,
    queryFn: () => apiClient.get<ResearchPerson[]>('/research/people'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useResearchProjects(filters?: Record<string, string>) {
  const p = new URLSearchParams({ ...filters });
  return useQuery({
    queryKey: researchKeys.projects(filters),
    queryFn:  () => apiClient.get<ResearchProjectV1[]>(`/research/projects?${p.toString()}`),
    staleTime: 60_000,
  });
}

export function useResearchProject(id: string | null) {
  return useQuery({
    queryKey: researchKeys.project(id ?? ''),
    queryFn:  () => apiClient.get<ResearchProjectV1>(`/research/projects/${id}`),
    enabled:  !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<ResearchProjectV1>('/research/projects', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['research', 'projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch<ResearchProjectV1>(`/research/projects/${id}`, data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: researchKeys.project(vars.id) });
      void qc.invalidateQueries({ queryKey: ['research', 'projects'] });
    },
  });
}

export function useUpdateProjectStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status: string; ethicsApprovalRef?: string; ethicsApprovedAt?: string }) =>
      apiClient.patch<ResearchProjectV1>(`/research/projects/${id}/status`, data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: researchKeys.project(vars.id) });
      void qc.invalidateQueries({ queryKey: ['research', 'projects'] });
    },
  });
}

export function useAddResearchMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userId, role }: { projectId: string; userId: string; role: MemberRole }) =>
      apiClient.post<ResearchProjectV1>(`/research/projects/${projectId}/members`, { userId, role }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: researchKeys.project(vars.projectId) });
      void qc.invalidateQueries({ queryKey: ['research', 'projects'] });
    },
  });
}

export function useRemoveResearchMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userId }: { projectId: string; userId: string }) =>
      apiClient.delete<{ message: string }>(`/research/projects/${projectId}/members/${userId}`),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: researchKeys.project(vars.projectId) });
      void qc.invalidateQueries({ queryKey: ['research', 'projects'] });
    },
  });
}

export function useAddGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...data }: { projectId: string } & Record<string, unknown>) =>
      apiClient.post<GrantV1>(`/research/projects/${projectId}/grants`, data),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: researchKeys.project(vars.projectId) }),
  });
}

export function useRecordExpenditure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ grantId, ...data }: { grantId: string } & Record<string, unknown>) =>
      apiClient.post<Record<string, unknown>>(`/research/grants/${grantId}/expenditures`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['research', 'projects'] }),
  });
}

export function useAddResearchOutput() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...data }: { projectId: string } & Record<string, unknown>) =>
      apiClient.post<ResearchOutputV1>(`/research/projects/${projectId}/outputs`, data),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: researchKeys.project(vars.projectId) }),
  });
}

export function useResearchSummary() {
  return useQuery({
    queryKey: researchKeys.summary,
    queryFn:  () => apiClient.get<ResearchSummaryV1>('/research/reports/summary'),
    staleTime: 5 * 60_000,
  });
}
