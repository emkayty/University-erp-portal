'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AlumniV1, CampaignV1, DonationV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const alumniKeys = {
  list:      (f?: Record<string,string>) => ['alumni', 'list', f ?? {}] as const,
  me:        ['alumni', 'me'] as const,
  campaigns: ['alumni', 'campaigns'] as const,
  campaign:  (id: string) => ['alumni', 'campaigns', id] as const,
  report:    (cid?: string) => ['alumni', 'report', cid ?? 'all'] as const,
};

export function useMyAlumniProfile() {
  return useQuery({
    queryKey: alumniKeys.me,
    queryFn:  () => apiClient.get<AlumniV1>('/alumni/me'),
    retry: false,
  });
}

export function useAlumni(filters?: Record<string, string>) {
  const p = new URLSearchParams({ pageSize: '20', ...filters });
  return useQuery({
    queryKey: alumniKeys.list(filters),
    queryFn:  () => apiClient.get<{ alumni: AlumniV1[]; total: number; totalPages: number }>(
      `/alumni?${p.toString()}`,
    ),
    staleTime: 2 * 60_000,
  });
}

export function useUpdateAlumniProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch<AlumniV1>(`/alumni/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: alumniKeys.me }),
  });
}

export function useActiveCampaigns() {
  return useQuery({
    queryKey: [...alumniKeys.campaigns, 'active'],
    queryFn:  () => apiClient.get<CampaignV1[]>('/alumni/campaigns/active'),
    staleTime: 5 * 60_000,
  });
}

export function useAllCampaigns() {
  return useQuery({
    queryKey: [...alumniKeys.campaigns, 'all'],
    queryFn:  () => apiClient.get<CampaignV1[]>('/alumni/campaigns/all'),
    staleTime: 2 * 60_000,
  });
}

export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: alumniKeys.campaign(id ?? ''),
    queryFn:  () => apiClient.get<CampaignV1>(`/alumni/campaigns/${id}`),
    enabled:  !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<CampaignV1>('/alumni/campaigns', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: alumniKeys.campaigns }),
  });
}

export function useDonateToCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      campaignId: string; alumniId?: string; amount: string;
      isAnonymous?: boolean; donorName?: string; donorEmail?: string; message?: string;
    }) => apiClient.post<{ id: string; amount: string; status: string; message: string }>('/alumni/donations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: alumniKeys.campaigns }),
  });
}

export function useDonationReport(campaignId?: string) {
  return useQuery({
    queryKey: alumniKeys.report(campaignId),
    queryFn:  () => {
      const url = campaignId
        ? `/alumni/reports/donations?campaignId=${campaignId}`
        : '/alumni/reports/donations';
      return apiClient.get<{ donations: DonationV1[]; summary: { totalDonations: number; totalAmount: string } }>(url);
    },
    staleTime: 60_000,
  });
}
