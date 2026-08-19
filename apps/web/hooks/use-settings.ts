'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsV1, UpdateSettingsDto } from '@uniportal/types';
import { apiClient, ApiClientError } from '@/lib/api-client';

export const settingsKeys = {
  root: ['settings'] as const,
  flags: ['settings', 'flags'] as const,
  moduleCapabilities: ['settings', 'module-capabilities'] as const,
  publicBranding: ['settings', 'public-branding'] as const,
};

export type PublicBrandingV1 = Pick<SettingsV1, 'institutionName' | 'institutionCode' | 'institutionType' | 'websiteUrl' | 'contactEmail' | 'contactPhone' | 'logoUrl' | 'faviconUrl' | 'primaryColor'>;

// ── GET /settings ─────────────────────────────────────────────────────────────
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.root,
    queryFn:  () => apiClient.get<SettingsV1>('/settings'),
    staleTime: 5 * 60_000,
  });
}

export function usePublicBranding() {
  return useQuery({
    queryKey: settingsKeys.publicBranding,
    queryFn: () => apiClient.get<PublicBrandingV1>('/settings/public/branding'),
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

// ── PATCH /settings ───────────────────────────────────────────────────────────
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateSettingsDto) =>
      apiClient.patch<SettingsV1>('/settings', data),
    onSuccess: (updated) => {
      qc.setQueryData(settingsKeys.root, updated);
    },
  });
}

// ── GET /settings/feature-flags ───────────────────────────────────────────────
export function useFeatureFlags() {
  return useQuery({
    queryKey: settingsKeys.flags,
    queryFn:  () => apiClient.get<Record<string, boolean>>('/settings/feature-flags'),
    staleTime: 5 * 60_000,
  });
}

export type ModuleCapabilitiesV1 = {
  module_lms: boolean;
  module_health: boolean;
  module_transport: boolean;
  module_research: boolean;
  module_alumni: boolean;
};

export function useModuleCapabilities(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: settingsKeys.moduleCapabilities,
    queryFn: () => apiClient.get<ModuleCapabilitiesV1>('/settings/capabilities'),
    staleTime: 5 * 60_000,
    retry: 1,
    enabled: options?.enabled ?? true,
  });
}

// ── PATCH /settings/feature-flags/:key ────────────────────────────────────────
export function useToggleFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiClient.patch<{ key: string; enabled: boolean }>(
        `/settings/feature-flags/${key}`,
        { enabled },
      ),
    // Optimistic update
    onMutate: async ({ key, enabled }) => {
      await qc.cancelQueries({ queryKey: settingsKeys.flags });
      const prev = qc.getQueryData<Record<string, boolean>>(settingsKeys.flags);
      qc.setQueryData(settingsKeys.flags, (old: Record<string, boolean> | undefined) =>
        old ? { ...old, [key]: enabled } : { [key]: enabled },
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(settingsKeys.flags, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: settingsKeys.flags }),
  });
}
