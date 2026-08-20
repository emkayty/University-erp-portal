"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export type AssessmentGradebook = {
  offering?: {
    id: string;
    semesterId: string | null;
    course: { code: string; title: string };
    semesterModel?: { name: string } | null;
  };
  scheme: {
    id: string;
    name: string;
    status: string;
    components: Array<{
      id: string;
      code: string;
      name: string;
      maxScore: number;
      weight: number;
    }>;
  };
  rows: Array<{
    student: {
      id: string;
      matricNo: string;
      firstName: string;
      lastName: string;
    };
    marks: Array<{ componentId: string; score: number; status?: string }>;
    finalScore: number;
    complete: boolean;
    finalized?: boolean;
  }>;
  summary: {
    total: number;
    complete: number;
    incomplete: number;
    finalized?: number;
    unfinalized?: number;
  };
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type GradeUploadResult = {
  batchId: string;
  status: string;
  mode: "VALIDATE_ONLY" | "APPLY";
  checksum: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  appliedMarks: number;
  errors: Array<{
    row: number;
    studentId?: string;
    matricNo?: string;
    error: string;
  }>;
};

export type AssessmentOffering = {
  id: string;
  sectionCode: string;
  semesterId: string;
  course: { code: string; title: string };
  semesterModel: { name: string; academicYear: string; semesterNumber: number };
  lecturer?: { firstName: string; lastName: string } | null;
};

export function useAssessmentOfferings() {
  return useQuery({
    queryKey: ["assessment", "offerings"],
    queryFn: () => apiClient.get<AssessmentOffering[]>("/assessment/offerings"),
    staleTime: 2 * 60_000,
  });
}

export function useAssessmentGradebook(
  courseOfferingId: string,
  page = 1,
  pageSize = 50,
  search = "",
) {
  return useQuery({
    queryKey: [
      "assessment",
      "gradebook",
      courseOfferingId,
      page,
      pageSize,
      search,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      return apiClient.get<AssessmentGradebook>(
        `/assessment/offerings/${courseOfferingId}/gradebook?${params.toString()}`,
      );
    },
    enabled: Boolean(courseOfferingId),
    placeholderData: (previous) => previous,
  });
}

export function useGenerateDraftResults() {
  return useMutation({
    mutationFn: (courseOfferingId: string) =>
      apiClient.post<{ generated: number; skipped: number }>(
        `/assessment/offerings/${courseOfferingId}/generate-results`,
      ),
  });
}

export function useFinalizeAssessmentMarks() {
  return useMutation({
    mutationFn: (courseOfferingId: string) =>
      apiClient.post<{
        courseOfferingId: string;
        finalized: number;
        finalizedAt: string;
      }>(`/assessment/offerings/${courseOfferingId}/finalize-marks`),
  });
}

export function useAssessmentExport() {
  return useMutation({
    mutationFn: (courseOfferingId: string) =>
      apiClient.download(`/assessment/offerings/${courseOfferingId}/export`),
  });
}

export function useAssessmentTemplate() {
  return useMutation({
    mutationFn: (courseOfferingId: string) =>
      apiClient.download(`/assessment/offerings/${courseOfferingId}/template`),
  });
}

export function useAssessmentCsvUpload() {
  return useMutation({
    mutationFn: (input: {
      courseOfferingId: string;
      semesterId: string;
      csv: string;
      fileName?: string;
      mode: "VALIDATE_ONLY" | "APPLY";
    }) => apiClient.post<GradeUploadResult>("/assessment/upload/csv", input),
  });
}

export function useSaveAssessmentMark(courseOfferingId: string) {
  return useMutation({
    mutationFn: (input: {
      studentId: string;
      componentId: string;
      score: number;
    }) =>
      apiClient.post<{
        id: string;
        studentId: string;
        componentId: string;
        score: number;
        status: string;
      }>("/assessment/marks", {
        ...input,
        courseOfferingId,
      }),
  });
}
