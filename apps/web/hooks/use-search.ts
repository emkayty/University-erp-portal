'use client';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/use-debounce';
import type {
  CourseSearchResultV1, GlobalSearchResultV1, LibrarySearchResultV1,
  StaffSearchResultV1, StudentSearchResultV1,
} from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

/** Minimum query length before a search fires */
const MIN_QUERY_LENGTH = 2;

export const searchKeys = {
  global:  (q: string) => ['search', 'global',  q] as const,
  students:(q: string, f?: Record<string,string>) => ['search', 'students', q, f ?? {}] as const,
  staff:   (q: string) => ['search', 'staff',   q] as const,
  courses: (q: string, deptId?: string) => ['search', 'courses', q, deptId ?? ''] as const,
  library: (q: string) => ['search', 'library', q] as const,
};

/**
 * Global search — debounced, fires across all domains the user has access to.
 * Minimum 2 characters. Debounced 300ms.
 */
export function useGlobalSearch(rawQuery: string) {
  const q = useDebounce(rawQuery.trim(), 300);
  return useQuery({
    queryKey: searchKeys.global(q),
    queryFn:  () => apiClient.get<GlobalSearchResultV1>(`/search/global?q=${encodeURIComponent(q)}`),
    enabled:  q.length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
    gcTime:    60_000,
    placeholderData: { students: [], courses: [], staff: [], library: [] },
  });
}

/** Student search — debounced, staff/hod/registrar only. */
export function useStudentSearch(rawQuery: string, filters?: Record<string, string>) {
  const q = useDebounce(rawQuery.trim(), 300);
  const qs = new URLSearchParams({ q, ...filters }).toString();
  return useQuery({
    queryKey: searchKeys.students(q, filters),
    queryFn:  () => apiClient.get<StudentSearchResultV1[]>(`/search/students?${qs}`),
    enabled:  q.length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
    placeholderData: [],
  });
}

/** Staff search — hr_manager / registrar / super_admin / vc. */
export function useStaffSearch(rawQuery: string) {
  const q = useDebounce(rawQuery.trim(), 300);
  return useQuery({
    queryKey: searchKeys.staff(q),
    queryFn:  () => apiClient.get<StaffSearchResultV1[]>(`/search/staff?q=${encodeURIComponent(q)}`),
    enabled:  q.length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
    placeholderData: [],
  });
}

/** Course search — all authenticated users. */
export function useCourseSearch(rawQuery: string, departmentId?: string) {
  const q = useDebounce(rawQuery.trim(), 300);
  const qs = new URLSearchParams({ q, ...(departmentId ? { departmentId } : {}) }).toString();
  return useQuery({
    queryKey: searchKeys.courses(q, departmentId),
    queryFn:  () => apiClient.get<CourseSearchResultV1[]>(`/search/courses?${qs}`),
    enabled:  q.length >= MIN_QUERY_LENGTH,
    staleTime: 5 * 60_000,
    placeholderData: [],
  });
}

/** Library item search — all authenticated users. */
export function useLibrarySearch(rawQuery: string) {
  const q = useDebounce(rawQuery.trim(), 300);
  return useQuery({
    queryKey: searchKeys.library(q),
    queryFn:  () => apiClient.get<LibrarySearchResultV1[]>(`/search/library?q=${encodeURIComponent(q)}`),
    enabled:  q.length >= MIN_QUERY_LENGTH,
    staleTime: 60_000,
    placeholderData: [],
  });
}
