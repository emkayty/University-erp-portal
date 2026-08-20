'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmPaymentResultV1, FeeScheduleV1, FeeWaiverV1,
  PaymentInitResultV1, PaymentV1, StudentFeeV1,
} from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const feesKeys = {
  schedules:      (year?: string) => ['fees', 'schedules', year ?? 'all'] as const,
  studentFees:    (id: string, year?: string) => ['fees', 'student', id, year ?? 'all'] as const,
  invoice:        (id: string) => ['fees', 'invoice', id] as const,
  pendingWaivers: ['fees', 'waivers', 'pending'] as const,
  paymentHistory: (id: string) => ['payments', 'history', id] as const,
};

// ── Fee Schedules ────────────────────────────────────────────────────────────
export function useFeeSchedules(academicYear?: string) {
  return useQuery({
    queryKey: feesKeys.schedules(academicYear),
    queryFn:  () => apiClient.get<FeeScheduleV1[]>(
      academicYear ? `/fees/schedules?academicYear=${academicYear}` : '/fees/schedules',
    ),
    staleTime: 5 * 60_000,
  });
}

export function useCreateFeeSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      programmeId?: string; level?: number; academicYear: string;
      feeType: string; amount: number; description?: string; dueDate?: string;
    }) => apiClient.post<FeeScheduleV1>('/fees/schedules', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: feesKeys.schedules() }),
  });
}

export function useUpdateFeeSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; amount?: number; isActive?: boolean; dueDate?: string; description?: string }) =>
      apiClient.patch<FeeScheduleV1>(`/fees/schedules/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: feesKeys.schedules() }),
  });
}

export function useGenerateInvoices() {
  return useMutation({
    mutationFn: (scheduleId: string) =>
      apiClient.post<{ jobId: string; message: string }>(`/fees/schedules/${scheduleId}/generate-invoices`),
  });
}

// ── Student Fees ──────────────────────────────────────────────────────────────
export function useStudentFees(studentId: string, academicYear?: string) {
  return useQuery({
    queryKey: feesKeys.studentFees(studentId, academicYear),
    queryFn:  () => apiClient.get<StudentFeeV1[]>(
      `/fees/students/${studentId}${academicYear ? `?academicYear=${academicYear}` : ''}`,
    ),
    enabled:  !!studentId,
    staleTime: 60_000,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: feesKeys.invoice(id),
    queryFn:  () => apiClient.get<StudentFeeV1>(`/fees/invoices/${id}`),
    enabled:  !!id,
  });
}

// ── Payments ──────────────────────────────────────────────────────────────────
export function useInitiatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...data }: { studentFeeId: string; provider: string; amount?: number; idempotencyKey: string }) =>
      apiClient.post<PaymentInitResultV1>('/payments/initiate', data, { idempotencyKey }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: feesKeys.invoice(vars.studentFeeId) }),
  });
}

export function usePaymentHistory(studentId: string) {
  return useQuery({
    queryKey: feesKeys.paymentHistory(studentId),
    queryFn:  () => apiClient.get<PaymentV1[]>(`/payments/history/${studentId}`),
    enabled:  !!studentId,
    staleTime: 60_000,
  });
}

export function useTsaManualPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { studentFeeId: string; amount: number; tsaReference: string; paidAt?: string }) =>
      apiClient.post<ConfirmPaymentResultV1>('/payments/tsa-manual', data),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: feesKeys.invoice(vars.studentFeeId) }),
  });
}

// ── Waivers ───────────────────────────────────────────────────────────────────
export function useRequestWaiver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { studentFeeId: string; waiverPct: number; reason: string }) =>
      apiClient.post<FeeWaiverV1>('/fees/waivers', data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: feesKeys.invoice(vars.studentFeeId) });
      void qc.invalidateQueries({ queryKey: feesKeys.pendingWaivers });
    },
  });
}

export function usePendingWaivers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: feesKeys.pendingWaivers,
    queryFn:  () => apiClient.get<FeeWaiverV1[]>('/fees/waivers/pending'),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useApproveWaiver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<{ message: string }>(`/fees/waivers/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: feesKeys.pendingWaivers }),
  });
}

export function useRejectWaiver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiClient.patch<{ message: string }>(`/fees/waivers/${id}/reject`, { note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: feesKeys.pendingWaivers }),
  });
}
