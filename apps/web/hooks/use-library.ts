'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibraryItemV1, LibraryLoanV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const libraryKeys = {
  search: (q?: string, cat?: string, pg?: number) => ['library', 'items', q ?? '', cat ?? '', pg ?? 1] as const,
  myLoans: ['library', 'loans', 'my'] as const,
  overdue: ['library', 'loans', 'overdue'] as const,
};

export function useLibrarySearch(q?: string, category?: string, page = 1, options?: { enabled?: boolean }) {
  const p = new URLSearchParams();
  if (q)        p.set('q',        q);
  if (category) p.set('category', category);
  if (page > 1) p.set('page',     String(page));
  return useQuery({
    queryKey: libraryKeys.search(q, category, page),
    queryFn:  () => apiClient.get<{ items: LibraryItemV1[]; total: number; totalPages: number }>(
      `/library/items?${p.toString()}`
    ),
    staleTime: 2 * 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useOverdueLoans(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: libraryKeys.overdue,
    queryFn: () => apiClient.get<LibraryLoanV1[]>('/library/loans/overdue'),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useMyLoans(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: libraryKeys.myLoans,
    queryFn:  () => apiClient.get<LibraryLoanV1[]>('/library/loans/my'),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateLibraryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { accessionNo: string; title: string; author?: string; isbn?: string; publisher?: string; publishYear?: number; category: string; totalCopies: number; shelfLocation?: string }) => apiClient.post<LibraryItemV1>('/library/items', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'items'] }),
  });
}

export function useBorrowItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { libraryItemId: string; dueDate: string }) =>
      apiClient.post<LibraryLoanV1>('/library/loans', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: libraryKeys.myLoans });
      void qc.invalidateQueries({ queryKey: libraryKeys.search() });
    },
  });
}

export function useReturnItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) => apiClient.patch<{ message: string; overdueDays: number; fineAmount: number }>(`/library/loans/${loanId}/return`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: libraryKeys.myLoans });
      void qc.invalidateQueries({ queryKey: libraryKeys.overdue });
    },
  });
}

export function useRenewLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) => apiClient.patch<LibraryLoanV1>(`/library/loans/${loanId}/renew`),
    onSuccess: () => qc.invalidateQueries({ queryKey: libraryKeys.myLoans }),
  });
}
