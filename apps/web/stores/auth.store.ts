'use client';

import { create } from 'zustand';
import type {
  LoginRequest, LoginResult, MfaRequiredResponse, MfaSetupRequiredResponse,
  MfaVerifyRequest, UserV1,
} from '@uniportal/types';
import { ApiClientError, apiClient, setAccessToken } from '../lib/api-client';

// H8 + H13 FIX:
// - User profile no longer persisted to sessionStorage (XSS readable).
// - State lives entirely in Zustand memory (lost on tab close — intentional).
// - BroadcastChannel syncs login/logout events across open tabs so a login
//   on Tab 1 is immediately reflected on Tab 2 without a page reload.
// - Access token stays in module-scope memory variable (api-client.ts).

const CHANNEL_NAME = 'uniportal:auth';

interface AuthState {
  user:       UserV1 | null;
  isLoading:  boolean;
  mfaPending: boolean;
  mfaToken:   string | null;
  login:      (credentials: LoginRequest) => Promise<void | MfaRequiredResponse | MfaSetupRequiredResponse>;
  verifyMfa:  (req: MfaVerifyRequest) => Promise<void>;
  logout:     () => Promise<void>;
  hydrate:    () => Promise<void>;
  setUser:    (user: UserV1) => void;
  clearSession: () => void;
}

// BroadcastChannel for cross-tab sync (not available in SSR)
let channel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  channel = new BroadcastChannel(CHANNEL_NAME);
}

export const useAuthStore = create<AuthState>()((set, get) => {
  // Listen to auth events from other tabs
  if (channel) {
    channel.onmessage = (e: MessageEvent<{ type: string; user?: UserV1 }>) => {
      if (e.data.type === 'login'  && e.data.user) set({ user: e.data.user, isLoading: false });
      if (e.data.type === 'logout') { setAccessToken(null); set({ user: null }); }
    };
  }

  return {
    user:       null,
    isLoading:  true,
    mfaPending: false,
    mfaToken:   null,

    login: async (credentials) => {
      const result = await apiClient.post<LoginResult>('/auth/login', credentials);

      if ('requiresMfa' in result && result.requiresMfa) {
        set({ mfaPending: true, mfaToken: result.mfaToken });
        return result;
      }
      if ('requiresMfaSetup' in result && result.requiresMfaSetup) {
        return result;
      }
      if (!('accessToken' in result) || !result.accessToken || !result.user) {
        throw new ApiClientError('AUTH_INVALID_RESPONSE', 'The authentication service returned an invalid login response.', 502);
      }
      const { accessToken, user } = result;
      setAccessToken(accessToken);
      set({ user, mfaPending: false, mfaToken: null, isLoading: false });
      channel?.postMessage({ type: 'login', user }); // Sync other tabs
      return;
    },

    verifyMfa: async (req) => {
      const result = await apiClient.post<{ accessToken: string; user: UserV1 }>(
        '/auth/mfa/verify', req,
      );
      setAccessToken(result.accessToken);
      set({ user: result.user, mfaPending: false, mfaToken: null, isLoading: false });
      channel?.postMessage({ type: 'login', user: result.user });
    },

    logout: async () => {
      try { await apiClient.post('/auth/logout'); } finally {
        setAccessToken(null);
        set({ user: null, mfaPending: false, mfaToken: null });
        channel?.postMessage({ type: 'logout' });
        document.cookie = `session_active=; Max-Age=0; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
      }
    },

    hydrate: async () => {
      set({ isLoading: true });
      try {
        const user = await apiClient.get<UserV1>('/auth/me');
        set({ user, isLoading: false });
      } catch {
        setAccessToken(null);
        set({ user: null, isLoading: false });
      }
    },

    setUser:      (user)  => set({ user }),
    clearSession: ()      => { setAccessToken(null); set({ user: null }); },
  };
});

export const useCurrentUser     = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => s.user !== null);
export const useIsLoading       = () => useAuthStore((s) => s.isLoading);
export const usePrimaryRole     = () => useAuthStore((s) => s.user?.primaryRole ?? null);
export const useStaffScope      = () => useAuthStore((s) => s.user?.staffScope  ?? null);
