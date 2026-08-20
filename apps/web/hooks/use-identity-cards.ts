'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type IdentityCardRecord = {
  id: string;
  holderType: 'STUDENT' | 'STAFF';
  cardNumber: string;
  serialNumber: string;
  issueDate: string;
  expiryDate: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED' | 'REPLACED';
  photoUrl?: string | null;
  verificationToken?: string;
  verificationCount: number;
  lastVerifiedAt?: string | null;
  lifecycleReason?: string | null;
  holder: {
    type: 'STUDENT' | 'STAFF';
    id: string;
    identifier: string;
    name: string;
    userId?: string;
    photoUrl?: string | null;
    programme?: { name: string; code: string } | null;
    department?: { name: string; code: string } | null;
    designation?: string;
  };
};

export type PublicIdentityVerification = {
  valid: boolean;
  cardNumber: string;
  serialNumber: string;
  holderType: 'STUDENT' | 'STAFF';
  name: string;
  identifier: string | null;
  designation: string | null;
  status: string;
  issueDate: string;
  expiryDate: string;
};

export const identityCardKeys = {
  mine: ['identity-cards', 'mine'] as const,
  list: (filters?: Record<string, unknown>) => ['identity-cards', 'list', filters ?? {}] as const,
  verify: (token: string) => ['identity-cards', 'verify', token] as const,
};

export function useMyIdentityCard(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: identityCardKeys.mine,
    queryFn: () => apiClient.get<IdentityCardRecord | null>('/identity-cards/me'),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useIdentityCards(filters?: { holderType?: string; status?: string; search?: string; enabled?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.holderType) params.set('holderType', filters.holderType);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  return useQuery({
    queryKey: identityCardKeys.list(filters),
    queryFn: () => apiClient.get<IdentityCardRecord[]>(`/identity-cards?${params.toString()}`),
    enabled: filters?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useIssueIdentityCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { holderType: 'STUDENT' | 'STAFF'; studentId?: string; staffId?: string; expiryDate: string; photoUrl?: string }) => apiClient.post<IdentityCardRecord>('/identity-cards/issue', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: identityCardKeys.mine });
      void qc.invalidateQueries({ queryKey: ['identity-cards', 'list'] });
    },
  });
}

export function useSuspendIdentityCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiClient.patch<IdentityCardRecord>(`/identity-cards/${id}/suspend`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['identity-cards'] }),
  });
}

export function useRevokeIdentityCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiClient.patch<IdentityCardRecord>(`/identity-cards/${id}/revoke`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['identity-cards'] }),
  });
}

export function useVerifyIdentityCard(token: string) {
  return useQuery({
    queryKey: identityCardKeys.verify(token),
    queryFn: () => apiClient.get<PublicIdentityVerification>(`/identity-cards/verify/${encodeURIComponent(token)}`),
    enabled: /^[a-f0-9]{64}$/i.test(token),
    retry: false,
  });
}
