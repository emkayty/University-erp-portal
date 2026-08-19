'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnalyticsDashboardV1, AuditLogV1, AuditSummaryV1, CgpaDistributionV1, DashboardSnapshotV1,
  EnrolmentStatsV1, HodDashboardV1, ReportJobV1, ResultsStatsV1,
  RevenueReportV1, StudentDashboardV1,
} from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const reportKeys = {
  jobs:         (page: number) => ['reports', 'jobs', page] as const,
  job:          (id: string)   => ['reports', 'jobs', id]   as const,
  enrolment:    (p?: Record<string,string>) => ['reports', 'enrolment', p ?? {}]    as const,
  revenue:      (p?: Record<string,string>) => ['reports', 'revenue',   p ?? {}]    as const,
  cgpa:         (p?: Record<string,string>) => ['reports', 'cgpa',      p ?? {}]    as const,
  results:      (p?: Record<string,string>) => ['reports', 'results',   p ?? {}]    as const,
  dashboard:    (p?: Record<string,string>) => ['reports', 'dashboard', p ?? {}]    as const,
  hodDashboard: (deptId: string)            => ['reports', 'hod', deptId]           as const,
  studentDash:  (studentId: string)         => ['reports', 'student', studentId]    as const,
  auditLogs:    (p?: Record<string,string>) => ['reports', 'audit', p ?? {}]        as const,
  auditSummary: ['reports', 'audit', 'summary'] as const,
};

// ── Async report generation ───────────────────────────────────────────────────
export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      reportType: string; reportFormat: string;
      dateFrom?: string; dateTo?: string; departmentId?: string;
      facultyId?: string; programmeId?: string; academicYear?: string;
    }) => apiClient.post<{ jobId: string; status: string; reportType: string }>('/reports/generate', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports', 'jobs'] }),
  });
}

export function useMyReportJobs(page = 1) {
  return useQuery({
    queryKey: reportKeys.jobs(page),
    queryFn:  () => apiClient.get<{ jobs: ReportJobV1[]; total: number; totalPages: number }>(
      `/reports/jobs?page=${page}&pageSize=20`,
    ),
    refetchInterval: (query) => {
      // Auto-poll every 3s if any job is still pending/processing
      const jobs = query.state.data?.jobs ?? [];
      const hasPending = jobs.some((j) => j.status === 'PENDING' || j.status === 'PROCESSING');
      return hasPending ? 3_000 : false;
    },
  });
}

export function useReportJob(jobId: string | null) {
  return useQuery({
    queryKey: reportKeys.job(jobId ?? ''),
    queryFn:  () => apiClient.get<ReportJobV1>(`/reports/jobs/${jobId}`),
    enabled:  !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' || status === 'PROCESSING' ? 3_000 : false;
    },
  });
}

// ── Live reports ──────────────────────────────────────────────────────────────
export function useEnrolmentStats(params?: Record<string, string>) {
  const qs = new URLSearchParams(params ?? {}).toString();
  return useQuery({
    queryKey: reportKeys.enrolment(params),
    queryFn:  () => apiClient.get<EnrolmentStatsV1>(`/reports/enrolment${qs ? `?${qs}` : ''}`),
    staleTime: 5 * 60_000,
  });
}

export function useRevenueReport(params?: Record<string, string>) {
  const qs = new URLSearchParams(params ?? {}).toString();
  return useQuery({
    queryKey: reportKeys.revenue(params),
    queryFn:  () => apiClient.get<RevenueReportV1>(`/reports/revenue${qs ? `?${qs}` : ''}`),
    staleTime: 5 * 60_000,
  });
}

export function useCgpaDistribution(params?: Record<string, string>) {
  const qs = new URLSearchParams(params ?? {}).toString();
  return useQuery({
    queryKey: reportKeys.cgpa(params),
    queryFn:  () => apiClient.get<CgpaDistributionV1>(`/reports/cgpa-distribution${qs ? `?${qs}` : ''}`),
    staleTime: 5 * 60_000,
  });
}

export function useResultsStats(params?: Record<string, string>) {
  const qs = new URLSearchParams(params ?? {}).toString();
  return useQuery({
    queryKey: reportKeys.results(params),
    queryFn:  () => apiClient.get<ResultsStatsV1>(`/reports/results-statistics${qs ? `?${qs}` : ''}`),
    staleTime: 5 * 60_000,
  });
}

// ── Dashboards ────────────────────────────────────────────────────────────────
export function useAnalyticsDashboard(params?: Record<string, string>, options?: { enabled?: boolean }) {
  const qs = new URLSearchParams(params ?? {}).toString();
  return useQuery({
    queryKey: reportKeys.dashboard(params),
    queryFn:  () => apiClient.get<AnalyticsDashboardV1>(`/reports/analytics/dashboard${qs ? `?${qs}` : ''}`),
    staleTime: 2 * 60_000,
    refetchInterval: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useHodDashboard(departmentId?: string, options?: { enabled?: boolean }) {
  const url = departmentId
    ? `/reports/analytics/hod/${departmentId}`
    : '/reports/analytics/hod';
  return useQuery({
    queryKey: reportKeys.hodDashboard(departmentId ?? 'self'),
    queryFn:  () => apiClient.get<HodDashboardV1>(url),
    staleTime: 2 * 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useStudentDashboard(studentId: string | null) {
  return useQuery({
    queryKey: reportKeys.studentDash(studentId ?? ''),
    queryFn:  () => apiClient.get<StudentDashboardV1>(`/reports/analytics/student/${studentId}`),
    enabled:  !!studentId,
    staleTime: 60_000,
  });
}


export function useMyDashboard() {
  return useQuery({
    queryKey: ['reports', 'my-dashboard'],
    queryFn: () => apiClient.get<DashboardSnapshotV1>('/reports/analytics/my-dashboard'),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

// ── Audit logs ────────────────────────────────────────────────────────────────
export function useAuditLogs(params?: Record<string, string>) {
  const qs = new URLSearchParams({ pageSize: '50', ...params }).toString();
  return useQuery({
    queryKey: reportKeys.auditLogs(params),
    queryFn:  () => apiClient.get<{ logs: AuditLogV1[]; total: number; totalPages: number }>(
      `/audit-logs?${qs}`,
    ),
    staleTime: 30_000,
  });
}

export function useAuditSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: reportKeys.auditSummary,
    queryFn:  () => apiClient.get<AuditSummaryV1>('/audit-logs/summary'),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}
