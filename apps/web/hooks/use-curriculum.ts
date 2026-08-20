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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['curriculum', 'faculties'] }),
  });
}

export function useUpdateFaculty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; isActive?: boolean } }) =>
      apiClient.patch<FacultyV1>(`/curriculum/faculties/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['curriculum', 'faculties'] });
      void qc.invalidateQueries({ queryKey: ['curriculum', 'departments'] });
    },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['curriculum', 'departments'] }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; isActive?: boolean } }) =>
      apiClient.patch<DepartmentV1>(`/curriculum/departments/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['curriculum', 'departments'] });
      void qc.invalidateQueries({ queryKey: ['curriculum', 'programmes'] });
      void qc.invalidateQueries({ queryKey: ['curriculum', 'courses'] });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['curriculum', 'programmes'] }),
  });
}

export function useUpdateProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; isActive?: boolean; minCreditUnits?: number; maxCreditUnits?: number } }) =>
      apiClient.patch<ProgrammeV1>(`/curriculum/programmes/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['curriculum', 'programmes'] });
      void qc.invalidateQueries({ queryKey: curriculumKeys.ccmas });
    },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['curriculum', 'courses'] }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; ccmasCategory?: string; description?: string; isActive?: boolean } }) =>
      apiClient.patch<CourseV1>(`/curriculum/courses/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['curriculum', 'courses'] });
      void qc.invalidateQueries({ queryKey: ['curriculum', 'programmes'] });
      void qc.invalidateQueries({ queryKey: curriculumKeys.ccmas });
    },
  });
}

export function useAddProgrammeCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programmeId, courseId, level, semester, isCompulsory = true, ccmasCategory }: {
      programmeId: string; courseId: string; level: number; semester: string;
      isCompulsory?: boolean; ccmasCategory?: string;
    }) => apiClient.post(`/curriculum/programmes/${programmeId}/courses`, { courseId, level, semester, isCompulsory, ccmasCategory }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: curriculumKeys.programme(vars.programmeId) });
      void qc.invalidateQueries({ queryKey: ['curriculum', 'programmes'] });
      void qc.invalidateQueries({ queryKey: curriculumKeys.ccmas });
    },
  });
}

export function useRemoveProgrammeCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programmeId, courseId, level, semester }: { programmeId: string; courseId: string; level: number; semester: string }) =>
      apiClient.delete(`/curriculum/programmes/${programmeId}/courses/${courseId}?level=${level}&semester=${semester}`),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: curriculumKeys.programme(vars.programmeId) });
      void qc.invalidateQueries({ queryKey: ['curriculum', 'programmes'] });
      void qc.invalidateQueries({ queryKey: curriculumKeys.ccmas });
    },
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

export function useRemovePrerequisite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, prerequisiteId }: { courseId: string; prerequisiteId: string }) =>
      apiClient.delete(`/curriculum/courses/${courseId}/prerequisites/${prerequisiteId}`),
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
