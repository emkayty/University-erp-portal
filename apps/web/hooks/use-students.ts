"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcademicHistoryV1,
  CourseRegistrationV1,
  StudentV1,
} from "@uniportal/types";
import { apiClient } from "@/lib/api-client";

export type StudentListMeta = { total: number; page: number; pageSize: number; totalPages: number };
export type StudentDirectoryResponse = { students: StudentV1[]; total: number; page: number; pageSize: number; totalPages: number };

export const studentKeys = {
  all: (f?: Record<string, unknown>) => ["students", f ?? {}] as const,
  one: (id: string) => ["students", id] as const,
  courses: (id: string) => ["students", id, "courses"] as const,
  history: (id: string) => ["students", id, "history"] as const,
};

export function useStudents(filters?: {
  status?: string;
  programmeId?: string;
  departmentId?: string;
  level?: number;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
  search?: string;
}) {
  const p = new URLSearchParams();
  if (filters?.status) p.set("status", filters.status);
  if (filters?.programmeId) p.set("programmeId", filters.programmeId);
  if (filters?.departmentId) p.set("departmentId", filters.departmentId);
  if (filters?.level) p.set("level", String(filters.level));
  if (filters?.page) p.set("page", String(filters.page));
  if (filters?.pageSize) p.set("pageSize", String(filters.pageSize));
  if (filters?.search) p.set("search", filters.search);

  return useQuery({
    queryKey: studentKeys.all(filters),
    queryFn: () => apiClient.get<StudentV1[]>(`/students?${p.toString()}`),
    enabled: filters?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useStudentDirectory(filters?: {
  programmeId?: string;
  departmentId?: string;
  level?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  enabled?: boolean;
}) {
  const p = new URLSearchParams();
  if (filters?.programmeId) p.set('programmeId', filters.programmeId);
  if (filters?.departmentId) p.set('departmentId', filters.departmentId);
  if (filters?.level) p.set('level', String(filters.level));
  if (filters?.page) p.set('page', String(filters.page));
  if (filters?.pageSize) p.set('pageSize', String(filters.pageSize));
  if (filters?.search) p.set('search', filters.search);
  return useQuery({
    queryKey: studentKeys.all({ directory: true, ...filters }),
    queryFn: () => apiClient.get<StudentDirectoryResponse>(`/students/directory?${p.toString()}`),
    enabled: filters?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: studentKeys.one(id),
    queryFn: () => apiClient.get<StudentV1>(`/students/${id}`),
    enabled: !!id,
  });
}

export function useMatriculate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      applicantId: string;
      entryLevel?: number;
      temporaryPassword?: string;
    }) =>
      apiClient.post<{ student: StudentV1; temporaryPassword: string }>(
        "/students/matriculate",
        data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: studentKeys.all() }),
  });
}

export function useRegisterCourses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentId,
      courseOfferingIds,
      semesterId,
    }: {
      studentId: string;
      courseOfferingIds: string[];
      semesterId: string;
    }) =>
      apiClient.post<{ registered: number; creditUnits: number }>(
        `/students/${studentId}/register-courses`,
        { courseOfferingIds, semesterId },
      ),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: studentKeys.courses(vars.studentId) }),
  });
}

export function useDropCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentId,
      courseOfferingId,
    }: {
      studentId: string;
      courseOfferingId: string;
    }) =>
      apiClient.patch(
        `/students/${studentId}/courses/${courseOfferingId}/drop`,
      ),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: studentKeys.courses(vars.studentId) }),
  });
}

export function useRegisteredCourses(studentId: string) {
  return useQuery({
    queryKey: studentKeys.courses(studentId),
    queryFn: () =>
      apiClient.get<CourseRegistrationV1[]>(
        `/students/${studentId}/registered-courses`,
      ),
    enabled: !!studentId,
    staleTime: 2 * 60_000,
  });
}

export function useAcademicHistory(studentId: string) {
  return useQuery({
    queryKey: studentKeys.history(studentId),
    queryFn: () =>
      apiClient.get<AcademicHistoryV1[]>(
        `/students/${studentId}/academic-history`,
      ),
    enabled: !!studentId,
    staleTime: 10 * 60_000,
  });
}

export type GraduationEligibility = {
  eligible: boolean;
  cgpa: number;
  cgpaOk: boolean;
  totalCreditUnitsEarned: number;
  minCreditUnitsRequired: number;
  creditUnitsOk: boolean;
  compulsoryCoursesOk: boolean;
  missingCompulsoryCourses: Array<{
    courseId: string;
    code: string;
    title: string;
  }>;
};

export function useGraduationEligibility(studentId: string) {
  return useQuery({
    queryKey: ["students", studentId, "graduation-eligibility"],
    queryFn: () =>
      apiClient.get<GraduationEligibility>(
        `/students/${studentId}/graduation-eligibility`,
      ),
    enabled: Boolean(studentId),
    staleTime: 30_000,
  });
}

function invalidateStudentLifecycle(
  qc: ReturnType<typeof useQueryClient>,
  studentId: string,
) {
  void qc.invalidateQueries({ queryKey: studentKeys.one(studentId) });
  void qc.invalidateQueries({ queryKey: studentKeys.all() });
  void qc.invalidateQueries({
    queryKey: ["students", studentId, "graduation-eligibility"],
  });
}

export function useCreateGraduationCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) =>
      apiClient.post(`/students/${studentId}/graduation-candidate`),
    onSuccess: (_data, studentId) => invalidateStudentLifecycle(qc, studentId),
  });
}

export function useApproveGraduation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) =>
      apiClient.post(`/students/${studentId}/graduation-approve`),
    onSuccess: (_data, studentId) => invalidateStudentLifecycle(qc, studentId),
  });
}

export function useGraduateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) =>
      apiClient.post(`/students/${studentId}/graduate`),
    onSuccess: (_data, studentId) => invalidateStudentLifecycle(qc, studentId),
  });
}

export function useUpdateStudentProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      phone?: string;
      currentAddress?: string;
      permanentAddress?: string;
      modeOfStudy?: string;
    }) => apiClient.patch<StudentV1>(`/students/${id}`, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: studentKeys.one(vars.id) });
      void qc.invalidateQueries({ queryKey: studentKeys.all() });
    },
  });
}

export function useUpdateStudentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: string;
      reason?: string;
    }) =>
      apiClient.patch<StudentV1>(`/students/${id}/status`, { action, reason }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: studentKeys.one(vars.id) });
      void qc.invalidateQueries({ queryKey: studentKeys.all() });
    },
  });
}
