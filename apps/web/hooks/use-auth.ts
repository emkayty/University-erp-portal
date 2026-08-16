'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import type { UserV1 } from '@uniportal/types';

import { apiClient, ApiClientError, setAccessToken } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

// ── Query keys ────────────────────────────────────────────────────────────────
export const authKeys = {
  me:       ['auth', 'me']       as const,
  sessions: ['auth', 'sessions'] as const,
};

// ── GET /auth/me ──────────────────────────────────────────────────────────────
/**
 * Fetches the current user profile.
 * Used in the dashboard layout to hydrate the auth store on page load.
 * Triggers a silent token refresh if the access token is expired.
 */
export function useCurrentUser() {
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey:  authKeys.me,
    queryFn:   async () => {
      const user = await apiClient.get<UserV1>('/auth/me');
      setUser(user);      // Keep Zustand store in sync
      return user;
    },
    staleTime:          5 * 60 * 1000,   // 5 minutes
    retry:              1,
    retryDelay:         1000,
  });
}

// ── POST /auth/logout ─────────────────────────────────────────────────────────
export function useLogout() {
  const queryClient  = useQueryClient();
  const clearSession = useAuthStore((s) => s.clearSession);
  const router       = useRouter();

  return useMutation({
    mutationFn: () => apiClient.post('/auth/logout'),
    onSettled:  () => {
      // Always clear client state even if server logout fails
      setAccessToken(null);
      clearSession();
      document.cookie = `session_active=; Max-Age=0; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
      queryClient.clear();
      router.replace('/auth/login');
    },
  });
}

// ── POST /auth/mfa/setup ──────────────────────────────────────────────────────
export function useMfaSetup() {
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ secret: string; qrCodeUri: string }>('/auth/mfa/setup'),
  });
}

// ── POST /auth/mfa/confirm-setup ──────────────────────────────────────────────
export function useMfaConfirmSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { totpCode: string; secret: string }) =>
      apiClient.post<{ backupCodes: string[] }>('/auth/mfa/confirm-setup', data),
    onSuccess: () => {
      // Invalidate profile to refresh mfaEnabled flag
      void queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

// ── PATCH /auth/change-password ───────────────────────────────────────────────
export function useChangePassword() {
  const router = useRouter();
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiClient.patch('/auth/change-password', data),
    onSuccess: () => {
      // Password change revokes all sessions — redirect to login
      setAccessToken(null);
      document.cookie = `session_active=; Max-Age=0; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
      router.replace('/auth/login?reason=password_changed');
    },
  });
}

// ── POST /auth/revoke-all ─────────────────────────────────────────────────────
export function useRevokeAllSessions() {
  const queryClient  = useQueryClient();
  const clearSession = useAuthStore((s) => s.clearSession);
  const router       = useRouter();

  return useMutation({
    mutationFn: () =>
      apiClient.post<{ revokedCount: number }>('/auth/revoke-all'),
    onSuccess: () => {
      setAccessToken(null);
      clearSession();
      document.cookie = `session_active=; Max-Age=0; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
      queryClient.clear();
      router.replace('/auth/login');
    },
  });
}
