'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttendanceSummaryV1, ExamTimetableV1, SemesterV1, StudentResultV1, TranscriptV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

// ── Semesters ─────────────────────────────────────────────────────────────────
export const semesterKeys = {
  all:     (y?: string) => ['semesters', y ?? 'all'] as const,
  current: ['semesters', 'current'] as const,
};

export function useSemesters(academicYear?: string) {
  return useQuery({
    queryKey: semesterKeys.all(academicYear),
    queryFn:  () => apiClient.get<SemesterV1[]>(
      academicYear ? `/exams/semesters?academicYear=${academicYear}` : '/exams/semesters',
    ),
    staleTime: 5 * 60_000,
  });
}

export function useCurrentSemester() {
  return useQuery({
    queryKey: semesterKeys.current,
    queryFn:  () => apiClient.get<SemesterV1 | null>('/exams/semesters/current'),
    staleTime: 60_000,
  });
}

export function useCreateSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      academicYear: string; semesterNumber: number; name: string;
      enrollmentStartDate: string; enrollmentEndDate: string;
      classStartDate: string; classEndDate: string;
      examStartDate: string; examEndDate: string; resultDeadline: string;
    }) => apiClient.post<SemesterV1>('/exams/semesters', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: semesterKeys.all() }),
  });
}

export function useAdvanceSemesterStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<SemesterV1>(`/exams/semesters/${id}/advance-status`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: semesterKeys.all() }),
  });
}

// ── Timetable ─────────────────────────────────────────────────────────────────
export function useTimetable(semesterId: string) {
  return useQuery({
    queryKey: ['timetable', semesterId],
    queryFn:  () => apiClient.get<ExamTimetableV1[]>(`/exams/timetable/${semesterId}`),
    enabled:  !!semesterId,
    staleTime: 5 * 60_000,
  });
}

// ── Attendance ────────────────────────────────────────────────────────────────
export function useAttendanceSummary(studentId: string, courseOfferingId: string) {
  return useQuery({
    queryKey: ['attendance', studentId, courseOfferingId],
    queryFn:  () => apiClient.get<AttendanceSummaryV1>(
      `/exams/attendance/student/${studentId}/course/${courseOfferingId}`,
    ),
    enabled:  !!(studentId && courseOfferingId),
  });
}

export function useRecordAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { studentId: string; courseOfferingId: string; semesterId: string; date: string; present: boolean; remark?: string }) =>
      apiClient.post('/exams/attendance', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
}

// ── Results ───────────────────────────────────────────────────────────────────
export const resultKeys = {
  student:    (id: string, sem?: string) => ['results', 'student', id, sem ?? 'all'] as const,
  transcript: (id: string)               => ['results', 'transcript', id] as const,
  course:     (id: string, sem: string)  => ['results', 'course', id, sem] as const,
};

export function useStudentResults(studentId: string, semesterId?: string) {
  return useQuery({
    queryKey: resultKeys.student(studentId, semesterId),
    queryFn:  () => apiClient.get<StudentResultV1[]>(
      `/results/student/${studentId}${semesterId ? `?semesterId=${semesterId}` : ''}`,
    ),
    enabled:  !!studentId,
    staleTime: 60_000,
  });
}

export function useTranscript(studentId: string) {
  return useQuery({
    queryKey: resultKeys.transcript(studentId),
    queryFn:  () => apiClient.get<TranscriptV1>(`/results/student/${studentId}/transcript`),
    enabled:  !!studentId,
    staleTime: 5 * 60_000,
  });
}

export function useSubmitResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { studentId: string; courseOfferingId: string; semesterId: string; score: number; absentFromExam?: boolean }) =>
      apiClient.post<StudentResultV1>('/results', data),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: resultKeys.student(v.studentId) }),
  });
}

export function useResultAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; action: string; rejectionReason?: string }) =>
      apiClient.patch<StudentResultV1 | { result: StudentResultV1; newCgpa: number }>(`/results/${id}/action`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['results'] }),
  });
}

export function useBulkResultAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { resultIds: string[]; action: string; rejectionReason?: string }) =>
      apiClient.post<{ processed: number; failed: number; errors: string[] }>('/results/bulk-action', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['results'] }),
  });
}
