"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdmissionCycleV1, ApplicantV1 } from "@uniportal/types";
import { apiClient } from "@/lib/api-client";

export const admissionsKeys = {
  cycles: ["admissions", "cycles"] as const,
  applications: (filters?: Record<string, unknown>) =>
    ["admissions", "applications", filters ?? {}] as const,
  application: (id: string) => ["admissions", "applications", id] as const,
};

// ── Cycles ────────────────────────────────────────────────────────────────────
export function useCycles(academicYear?: string) {
  return useQuery({
    queryKey: admissionsKeys.cycles,
    queryFn: () =>
      apiClient.get<AdmissionCycleV1[]>(
        academicYear
          ? `/admissions/cycles?academicYear=${academicYear}`
          : "/admissions/cycles",
      ),
    staleTime: 5 * 60_000,
  });
}

export function useCreateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      academicYear: string;
      cycleName: string;
      admissionType: string;
      openDate: string;
      closeDate: string;
      utmeMinScore?: number;
      maxApplicants?: number;
    }) => apiClient.post<AdmissionCycleV1>("/admissions/cycles", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: admissionsKeys.cycles }),
  });
}

export function useActivateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<AdmissionCycleV1>(`/admissions/cycles/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: admissionsKeys.cycles }),
  });
}

// ── Applications ──────────────────────────────────────────────────────────────
export function useApplications(filters?: {
  status?: string;
  admissionType?: string;
  cycleId?: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.admissionType)
    params.set("admissionType", filters.admissionType);
  if (filters?.cycleId) params.set("cycleId", filters.cycleId);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

  return useQuery({
    queryKey: admissionsKeys.applications(filters),
    queryFn: () =>
      apiClient.get<ApplicantV1[]>(
        `/admissions/applications?${params.toString()}`,
      ),
    staleTime: 60_000,
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: admissionsKeys.application(id),
    queryFn: () => apiClient.get<ApplicantV1>(`/admissions/applications/${id}`),
    enabled: !!id,
  });
}

export function useUpdateApplicationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      status: string;
      rejectionReason?: string;
      offerDeadline?: string;
    }) =>
      apiClient.patch<ApplicantV1>(
        `/admissions/applications/${id}/status`,
        data,
      ),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: admissionsKeys.application(vars.id),
      });
      void qc.invalidateQueries({ queryKey: admissionsKeys.applications() });
    },
  });
}

export type AccessibilitySupportReview = {
  id?: string;
  requested: boolean;
  supportAreas?: string[];
  requestedAdjustments?: string[];
  supportDescription?: string | null;
  preferredContactMethod?: string | null;
  preferredFormat?: string | null;
  consentAccepted?: boolean;
  status?: "REQUESTED" | "CONTACTED" | "ARRANGED" | "DECLINED" | "CLOSED";
  assignedSupportOfficerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
};

export type ApplicationChangeRequest = {
  id: string;
  requestType: "CORRECTION" | "WITHDRAWAL";
  status: "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "COMPLETED";
  reason?: string | null;
  requestedChanges?: Record<string, unknown> | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedById?: string | null;
};

export function useAccessibilitySupport(applicantId?: string) {
  return useQuery({
    queryKey: [
      "admissions",
      "applications",
      applicantId,
      "accessibility-support",
    ],
    queryFn: () =>
      apiClient.get<AccessibilitySupportReview>(
        `/admissions/applications/${applicantId}/accessibility-support`,
      ),
    enabled: Boolean(applicantId),
  });
}

export function useUpdateAccessibilitySupport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicantId,
      status,
      assignedSupportOfficerId,
    }: {
      applicantId: string;
      status: AccessibilitySupportReview["status"];
      assignedSupportOfficerId?: string;
    }) =>
      apiClient.patch(
        `/admissions/applications/${applicantId}/accessibility-support`,
        {
          status,
          assignedSupportOfficerId: assignedSupportOfficerId || undefined,
        },
      ),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: [
          "admissions",
          "applications",
          variables.applicantId,
          "accessibility-support",
        ],
      });
    },
  });
}

export function useApplicationChangeRequests(applicantId?: string) {
  return useQuery({
    queryKey: ["admissions", "applications", applicantId, "change-requests"],
    queryFn: () =>
      apiClient.get<ApplicationChangeRequest[]>(
        `/admissions/applications/${applicantId}/change-requests`,
      ),
    enabled: Boolean(applicantId),
  });
}

export function useUpdateApplicationChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicantId,
      requestId,
      status,
      note,
    }: {
      applicantId: string;
      requestId: string;
      status: ApplicationChangeRequest["status"];
      note?: string;
    }) =>
      apiClient.patch(
        `/admissions/applications/${applicantId}/change-requests/${requestId}`,
        { status, note: note || undefined },
      ),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: [
          "admissions",
          "applications",
          variables.applicantId,
          "change-requests",
        ],
      });
    },
  });
}

export type AdmissionEligibility = {
  eligible: boolean;
  reasons?: string[];
  missingDocuments?: string[];
  oLevel?: { eligible: boolean; reasons?: string[] };
  jamb?: { eligible: boolean; reason?: string };
};

export type OLevelEligibility = {
  eligible: boolean;
  reasons?: string[];
  creditCount?: number;
  requiredCredits?: number;
};

export type AdmissionRequirement = {
  id: string;
  programmeId: string;
  admissionType: string;
  academicYear: string;
  minUtmeScore?: number | null;
  minOLevelCredits?: number | null;
  maxOLevelSittings?: number | null;
  requireEnglish?: boolean;
  requireMathematics?: boolean;
  requiredDocuments?: string[];
  subjectRequirements?: Array<{
    subject: string;
    required?: boolean;
    alternatives?: string[];
  }>;
};

export function useAdmissionRequirements(
  filters?: { programmeId?: string; academicYear?: string },
  options?: { enabled?: boolean },
) {
  const params = new URLSearchParams();
  if (filters?.programmeId) params.set("programmeId", filters.programmeId);
  if (filters?.academicYear) params.set("academicYear", filters.academicYear);
  return useQuery({
    queryKey: ["admissions", "requirements", filters ?? {}],
    queryFn: () =>
      apiClient.get<AdmissionRequirement[]>(
        `/admissions/requirements?${params.toString()}`,
      ),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateAdmissionRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<AdmissionRequirement>("/admissions/requirements", data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admissions", "requirements"] }),
  });
}

export function useOLevelEligibility(applicantId?: string) {
  return useQuery({
    queryKey: ["admissions", "applications", applicantId, "olevel-eligibility"],
    queryFn: () =>
      apiClient.get<OLevelEligibility>(
        `/admissions/applications/${applicantId}/olevel-eligibility`,
      ),
    enabled: Boolean(applicantId),
  });
}

export function useAdmissionEligibility(applicantId?: string) {
  return useQuery({
    queryKey: ["admissions", "applications", applicantId, "eligibility"],
    queryFn: () =>
      apiClient.get<AdmissionEligibility>(
        `/admissions/applications/${applicantId}/eligibility`,
      ),
    enabled: Boolean(applicantId),
  });
}

export function useRecordOLevelResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicantId,
      results,
    }: {
      applicantId: string;
      results: Array<Record<string, unknown>>;
    }) =>
      apiClient.post(`/admissions/applications/${applicantId}/olevel-results`, {
        results,
      }),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({
        queryKey: ["admissions", "applications", variables.applicantId],
      }),
  });
}

export function useVerifyOLevelResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicantId,
      status,
      remarks,
    }: {
      applicantId: string;
      status: "PENDING" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
      remarks?: string;
    }) =>
      apiClient.patch(
        `/admissions/applications/${applicantId}/olevel-verification`,
        { status, remarks },
      ),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({
        queryKey: ["admissions", "applications", variables.applicantId],
      }),
  });
}

export function useVerifyJamb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicantId,
      verified,
      score,
      remarks,
    }: {
      applicantId: string;
      verified: boolean;
      score: number;
      remarks?: string;
    }) =>
      apiClient.patch(
        `/admissions/applications/${applicantId}/jamb-verification`,
        { verified, score, remarks },
      ),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({
        queryKey: ["admissions", "applications", variables.applicantId],
      }),
  });
}

export function useVerifyApplicationDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicantId,
      documentId,
      status,
      rejectionReason,
    }: {
      applicantId: string;
      documentId: string;
      status: "PENDING" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
      rejectionReason?: string;
    }) =>
      apiClient.patch(
        `/admissions/applications/${applicantId}/documents/${documentId}/verification`,
        { status, rejectionReason },
      ),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({
        queryKey: admissionsKeys.application(variables.applicantId),
      }),
  });
}

export function useScreenBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { admissionCycleId: string; dryRun?: boolean }) =>
      apiClient.post<{
        screened: number;
        rejected: number;
        skipped: number;
        dryRun: boolean;
      }>("/admissions/screen/bulk", data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: admissionsKeys.applications() }),
  });
}
