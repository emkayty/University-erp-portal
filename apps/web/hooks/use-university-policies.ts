"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export type UniversityPolicyStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED"
  | "ARCHIVED";
export type UniversityPolicyCategory =
  | "ACADEMIC"
  | "ADMISSIONS"
  | "ASSESSMENT_AND_EXAMINATIONS"
  | "FINANCE_AND_FEES"
  | "STUDENT_AFFAIRS"
  | "STAFF_AND_HR"
  | "RESEARCH_AND_ETHICS"
  | "ICT_AND_DATA_PROTECTION"
  | "HEALTH_SAFETY_AND_SECURITY"
  | "GOVERNANCE_AND_COMPLIANCE"
  | "OTHER";

export interface UniversityPolicy {
  id: string;
  policyCode: string;
  version: string;
  title: string;
  category: UniversityPolicyCategory;
  summary: string | null;
  content?: string;
  status: UniversityPolicyStatus;
  effectiveFrom: string | null;
  reviewDueAt: string | null;
  requiresAcknowledgement: boolean;
  acknowledgementDueAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  rejectionReason?: string | null;
  createdById?: string;
  updatedById?: string | null;
  approvedById?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { acknowledgements: number };
}

export interface PolicyListResponse {
  policies: UniversityPolicy[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PolicyFormData {
  policyCode?: string;
  version?: string;
  title?: string;
  category?: UniversityPolicyCategory;
  summary?: string;
  content?: string;
  effectiveFrom?: string;
  reviewDueAt?: string;
  requiresAcknowledgement?: boolean;
  acknowledgementDueAt?: string;
}

export const universityPolicyKeys = {
  root: ["university-policies"] as const,
  list: (filters: Record<string, string | number | undefined>) =>
    ["university-policies", "list", filters] as const,
  detail: (id: string) => ["university-policies", id] as const,
};

function invalidatePolicies(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: universityPolicyKeys.root });
}

export function useUniversityPolicies(
  filters: {
    status?: UniversityPolicyStatus;
    category?: UniversityPolicyCategory;
    search?: string;
  } = {},
  options?: { enabled?: boolean },
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return useQuery({
    queryKey: universityPolicyKeys.list(filters),
    queryFn: () =>
      apiClient.get<PolicyListResponse>(`/university-policies${suffix}`),
    enabled: options?.enabled ?? true,
  });
}

export function useUniversityPolicy(
  id?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: universityPolicyKeys.detail(id ?? "none"),
    queryFn: () =>
      apiClient.get<UniversityPolicy>(`/university-policies/${id}`),
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useCreateUniversityPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Required<
        Pick<PolicyFormData, "policyCode" | "title" | "category" | "content">
      > &
        PolicyFormData,
    ) => apiClient.post<UniversityPolicy>("/university-policies", data),
    onSuccess: () => invalidatePolicies(queryClient),
  });
}

export function useUpdateUniversityPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PolicyFormData }) =>
      apiClient.patch<UniversityPolicy>(`/university-policies/${id}`, data),
    onSuccess: (policy) => {
      queryClient.setQueryData(universityPolicyKeys.detail(policy.id), policy);
      return invalidatePolicies(queryClient);
    },
  });
}

export function usePolicyLifecycleAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      data,
    }: {
      id: string;
      action: "submit" | "review" | "publish" | "archive" | "revisions";
      data?: Record<string, unknown>;
    }) =>
      apiClient.post<UniversityPolicy>(
        `/university-policies/${id}/${action}`,
        data ?? {},
      ),
    onSuccess: (policy) => {
      queryClient.setQueryData(universityPolicyKeys.detail(policy.id), policy);
      return invalidatePolicies(queryClient);
    },
  });
}

export function usePolicyAcknowledgements(
  id?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["university-policies", id, "acknowledgements"],
    queryFn: () =>
      apiClient.get<{
        acknowledgements: Array<{
          id: string;
          acknowledgedAt: string;
          user: { id: string; email: string; phone: string | null };
        }>;
        total: number;
      }>(`/university-policies/${id}/acknowledgements`),
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}
