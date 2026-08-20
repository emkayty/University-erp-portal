'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import React, { useState } from 'react';
import { FeedbackToaster } from '@/components/ui/feedback-toaster';

/**
 * Application-wide providers — wraps the entire tree.
 *
 * Includes:
 *  - TanStack Query (server state management)
 *  - ThemeProvider (dark/light mode via next-themes)
 *
 * Phase 1+ additions:
 *  - Toaster (notification toasts)
 *  - AuthProvider (session validation on mount)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Instantiate QueryClient inside component so each request gets
  // a fresh client in SSR (prevents cross-request state leaks)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data considered fresh for 2 minutes by default
            staleTime:            2 * 60 * 1000,
            // Keep inactive data in cache for 10 minutes
            gcTime:               10 * 60 * 1000,
            // Retry failed requests 2 times with exponential backoff
            retry:                2,
            retryDelay:           (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
            // Refetch when window regains focus (catches stale data after tab switch)
            refetchOnWindowFocus: true,
            // Do NOT refetch on reconnect (avoids waterfall after page load)
            refetchOnReconnect:   false,
          },
          mutations: {
            // Show retry for mutations by default
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>

      <FeedbackToaster />

      {/* React Query Devtools — only in development */}
      {process.env['NODE_ENV'] === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </QueryClientProvider>
  );
}
