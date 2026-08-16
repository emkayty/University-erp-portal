'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CcmasComplianceV1, CourseV1, DepartmentV1, FacultyV1, ProgrammeV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const curriculumKeys = {
  faculties:   ['curriculum', 'faculties']                      as const,
  faculty:     (id: string) => ['curriculum', 'faculties', id]  as const,
  departments: (fId?: string) => ['curriculum', 'departments', fId ?? 'all'] as const,
  programmes:  (dId?: string) => ['curriculum', 'programmes',  dId ?? 'all'] as const,
  programme:   (id: string)  => ['curriculum', 'programmes', id]  as const,
  courses:     (dId?: string) => ['curriculum', 'courses', dId ?? 'all'] as const,
  course:      (id: string)  => ['curriculum', 'courses', id]    as const,
  offerings:   (calId?: string, sem?: string) => ['curriculum', 'offerings', calId ?? 'all', sem ?? 'all'] as const,
  ccmas:       ['curriculum', 'ccmas-compliance']               as const,
};

// ── Faculties ─────────────────────────────────────────────────────────────────
export function useFaculties() {
  return useQuery({
    queryKey: curriculumKeys.faculties,
    queryFn:  () => apiClient.get<FacultyV1[]>('/curriculum/faculties'),
    staleTime: 10 * 60_000,
  });
}

export function useCreateFaculty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; code: string }) =>
      apiClient.post<FacultyV1>('/curriculum/faculties', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: curriculumKeys.faculties }),
  });
}

// ── Departments ───────────────────────────────────────────────────────────────
export function useDepartments(facultyId?: string) {
  return useQuery({
    queryKey: curriculumKeys.departments(facultyId),
    queryFn:  () => apiClient.get<DepartmentV1[]>(
      facultyId ? `/curriculum/departments?facultyId=${facultyId}` : '/curriculum/departments',
    ),
    staleTime: 10 * 60_000,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; code: string; facultyId: string }) =>
      apiClient.post<DepartmentV1>('/curriculum/departments', data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: curriculumKeys.departments(vars.facultyId) });
      void qc.invalidateQueries({ queryKey: curriculumKeys.departments() });
    },
  });
}

// ── Programmes ────────────────────────────────────────────────────────────────
export function useProgrammes(departmentId?: string) {
  return useQuery({
    queryKey: curriculumKeys.programmes(departmentId),
    queryFn:  () => apiClient.get<ProgrammeV1[]>(
      departmentId ? `/curriculum/programmes?departmentId=${departmentId}` : '/curriculum/programmes',
    ),
    staleTime: 10 * 60_000,
  });
}

export function useProgramme(id: string) {
  return useQuery({
    queryKey: curriculumKeys.programme(id),
    queryFn:  () => apiClient.get<ProgrammeV1>(`/curriculum/programmes/${id}`),
    enabled:  !!id,
  });
}

export function useCreateProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string; code: string; departmentId: string;
      degreeType: string; durationYears: number;
      minCreditUnits?: number; maxCreditUnits?: number;
    }) => apiClient.post<ProgrammeV1>('/curriculum/programmes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: curriculumKeys.programmes() }),
  });
}

// ── Courses ───────────────────────────────────────────────────────────────────
export function useCourses(departmentId?: string) {
  return useQuery({
    queryKey: curriculumKeys.courses(departmentId),
    queryFn:  () => apiClient.get<CourseV1[]>(
      departmentId ? `/curriculum/courses?departmentId=${departmentId}` : '/curriculum/courses',
    ),
    staleTime: 10 * 60_000,
  });
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: curriculumKeys.course(id),
    queryFn:  () => apiClient.get<CourseV1>(`/curriculum/courses/${id}`),
    enabled:  !!id,
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      code: string; title: string; creditUnits: number;
      departmentId: string; ccmasCategory: string; description?: string;
    }) => apiClient.post<CourseV1>('/curriculum/courses', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: curriculumKeys.courses() }),
  });
}

export function useAddPrerequisite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, prerequisiteId, minGrade = 'E' }: { courseId: string; prerequisiteId: string; minGrade?: string }) =>
      apiClient.post(`/curriculum/courses/${courseId}/prerequisites`, { prerequisiteId, minGrade }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: curriculumKeys.course(vars.courseId) }),
  });
}

// ── CCMAS Compliance ──────────────────────────────────────────────────────────
export function useCcmasCompliance() {
  return useQuery({
    queryKey: curriculumKeys.ccmas,
    queryFn:  () => apiClient.get<CcmasComplianceV1[]>('/curriculum/ccmas-compliance'),
    staleTime: 30 * 60_000,
  });
}
