'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PayrollRunV1, PayslipV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const payrollKeys = {
  runs:        (year?: number) => ['payroll', 'runs', year ?? 'all'] as const,
  payslips:    (runId: string) => ['payroll', 'payslips', runId] as const,
  myPayslips:  (id: string)    => ['payroll', 'staff', id] as const,
};

export function usePayrollRuns(year?: number) {
  return useQuery({
    queryKey: payrollKeys.runs(year),
    queryFn:  () => apiClient.get<PayrollRunV1[]>(`/payroll/runs${year ? `?year=${year}` : ''}`),
    staleTime: 60_000,
  });
}

export function useCreatePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { periodMonth: number; periodYear: number; label: string; notes?: string }) =>
      apiClient.post<PayrollRunV1>('/payroll/runs', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: payrollKeys.runs() }),
  });
}

export function usePayrollAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiClient.post<PayrollRunV1>(`/payroll/runs/${id}/action`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: payrollKeys.runs() }),
  });
}

export function useRunPayslips(runId: string) {
  return useQuery({
    queryKey: payrollKeys.payslips(runId),
    queryFn:  () => apiClient.get<PayslipV1[]>(`/payroll/runs/${runId}/payslips`),
    enabled:  !!runId,
    staleTime: 60_000,
  });
}

export function useMyPayslips(staffId: string) {
  return useQuery({
    queryKey: payrollKeys.myPayslips(staffId),
    queryFn:  () => apiClient.get<PayslipV1[]>(`/payroll/staff/${staffId}/payslips`),
    enabled:  !!staffId,
    staleTime: 5 * 60_000,
  });
}
