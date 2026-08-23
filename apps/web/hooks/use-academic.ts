
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const academicKeys = {
  journey: ["academic", "me", "journey"] as const,
  graduationPolicies: (scope?: string, scopeId?: string) =>
    ["academic", "graduation-policies", scope, scopeId] as const,
};

export type GraduationPolicy = {
  id: string;
  policyType: string;
  scope: "INSTITUTION" | "FACULTY" | "DEPARTMENT" | "PROGRAMME";
  scopeId: string | null;
  priority: number;
  ruleDefinition: {
    requirements?: Array<{
      graduationRequirementId: string;
      requirementType: string;
      config: Record<string, unknown>;
      isMandatory: boolean;
    }>;
  };
  approvalStatus: "DRAFT" | "ACTIVE" | "EXPIRED" | "REVOKED";
  effectiveFrom: string;
  effectiveTo?: string | null;
  approvedAt?: string | null;
};

export type AcademicJourneyAction = {
  code: string;
  title: string;
  reason: string;
  ownerRole: string;
  requiresApproval: boolean;
};

export type AcademicJourneyHistory = {
  id: string;
  academicYear: string;
  level: number;
  status: string;
  gpa: number | string | null;
  cgpa: number | string | null;
};

export type AcademicJourneyCourse = {
  id: string;
  courseId: string;
  code: string;
  title: string;
  credits: number;
  semester: string;
};

export type AcademicJourneyResult = {
  id: string;
  code: string;
  title: string;
  score: number;
  grade: string;
  gradePoint: number;
  credits: number;
  semester: string;
  academicYear: string;
};

export type AcademicPlan = {
  id: string;
  status?: string;
  rationale?: unknown;
  items?: Array<{
    id: string;
    targetPeriod?: string | null;
    status?: string | null;
    course?: { code: string; title: string } | null;
  }>;
};

export type DegreeAudit = {
  id: string;
  status: string;
  createdAt: string;
  requirementResults?: unknown;
};

export type AcademicJourney = {
  student: {
    id: string;
    matricNo: string;
    firstName: string;
    lastName: string;
    level: number;
    status: string;
  };
  programme: {
    id: string;
    code: string;
    name: string;
    degreeType: string;
    department: string;
    faculty: string;
  };
  curriculum: {
    id: string;
    academicYear: string;
    version: number;
    status: string;
  };
  progress: {
    cgpa: number;
    creditsEarned: number;
    creditsRequired: number;
    percent: number;
    outstandingCourses: number;
    outstandingRequirementGroups: number;
  };
  readiness: {
    status: "READY" | "ATTENTION" | string;
    warnings: string[];
    evidence: {
      hasDegreeAudit: boolean;
      hasAcademicPlan: boolean;
      hasPublishedResults: boolean;
      currentRegistrationCount: number;
    };
  };
  nextActions: AcademicJourneyAction[];
  history: AcademicJourneyHistory[];
  currentCourses: AcademicJourneyCourse[];
  results: AcademicJourneyResult[];
  outstanding: Array<{
    courseId: string;
    code: string;
    title: string;
    creditUnits: number;
    level: number;
    semester: string;
    isCompulsory: boolean;
  }>;
  degreeAudit: {
    id: string;
    status: string;
    snapshot: unknown;
    auditedAt: string;
  } | null;
  academicPlan: AcademicPlan | null;
  graduation: Record<string, unknown> | null;
};

export function useGraduationPolicies(
  scope?: GraduationPolicy["scope"],
  scopeId?: string,
) {
  return useQuery({
    queryKey: academicKeys.graduationPolicies(scope, scopeId),
    queryFn: () => {
      const params = new URLSearchParams();
      if (scope) params.set("scope", scope);
      if (scopeId) params.set("scopeId", scopeId);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return apiClient.get<GraduationPolicy[]>(
        `/academic/graduation-policies${suffix}`,
      );
    },
    enabled: Boolean(scope),
  });
}

export function useCreateGraduationPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      scope: GraduationPolicy["scope"];
      scopeId?: string;
      priority?: number;
      ruleDefinition: GraduationPolicy["ruleDefinition"];
      effectiveFrom?: string;
      effectiveTo?: string;
    }) =>
      apiClient.post<GraduationPolicy>("/academic/graduation-policies", data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["academic", "graduation-policies"] }),
  });
}

export function useActivateGraduationPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyId: string) =>
      apiClient.post<GraduationPolicy>(
        `/academic/graduation-policies/${policyId}/activate`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["academic", "graduation-policies"] }),
  });
}

export function useAcademicJourney(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: academicKeys.journey,
    queryFn: () => apiClient.get<AcademicJourney>("/academic/me/journey"),
    enabled: options?.enabled ?? true,
  });
}

export function useMyDegreeAudit(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...academicKeys.journey, "degree-audit"],
    queryFn: () => apiClient.get<DegreeAudit | null>("/academic/me/degree-audit"),
    enabled: options?.enabled ?? true,
  });
}

export function useMyAcademicPlan(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...academicKeys.journey, "plan"],
    queryFn: () => apiClient.get<AcademicPlan | null>("/academic/me/plan"),
    enabled: options?.enabled ?? true,
  });
}

export function useRunDegreeAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) =>
      apiClient.post(`/academic/students/${studentId}/degree-audit/run`),
    onSuccess: (_data, studentId) => {
      void qc.invalidateQueries({ queryKey: ["students", studentId] });
      void qc.invalidateQueries({ queryKey: ["academic"] });
    },
  });
}

export function useRunProgressionEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) =>
      apiClient.post(`/academic/students/${studentId}/progression/run`),
    onSuccess: (_data, studentId) => {
      void qc.invalidateQueries({ queryKey: ["students", studentId] });
      void qc.invalidateQueries({ queryKey: ["academic"] });
    },
  });
}

export function useSubmitAcademicAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      appealType: string;
      subjectId?: string;
      reason: string;
      evidenceRef?: string;
    }) => apiClient.post("/academic/me/appeals", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicKeys.journey }),
  });
}

export function useRequestProgrammeTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { toProgrammeId: string; reason?: string }) =>
      apiClient.post("/academic/me/programme-transfers", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicKeys.journey }),
  });
}

export function useRequestAcademicInterruption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type: string;
      startDate: string;
      endDate?: string;
      reason?: string;
    }) => apiClient.post("/academic/me/interruptions", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: academicKeys.journey }),
  });
}
