'use client';

import type { CSSProperties } from 'react';
import { usePublicBranding } from '@/hooks/use-settings';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { data: branding } = usePublicBranding();
  const institutionName = branding?.institutionName ?? 'UniPortal ERP';
  const institutionType = branding?.institutionType === 'UNIVERSITY'
    ? 'University Administration System'
    : branding?.institutionType?.replaceAll('_', ' ') ?? 'University Administration System';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4 sm:p-6" style={branding?.primaryColor ? { '--color-primary': branding.primaryColor } as CSSProperties : undefined}>
      <main className="flex w-full max-w-2xl flex-col items-center">
        <div className="mb-8 text-center sm:mb-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[--color-primary] shadow-lg" aria-hidden={!branding?.logoUrl}>
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-full w-full object-contain p-2" />
            ) : (
              <svg viewBox="0 0 32 32" fill="none" className="h-9 w-9 text-white" aria-hidden="true">
                <path d="M16 2L3 9v2h26V9L16 2z" fill="currentColor" opacity=".9" />
                <rect x="5" y="13" width="4" height="12" fill="currentColor" opacity=".8" />
                <rect x="14" y="13" width="4" height="12" fill="currentColor" />
                <rect x="23" y="13" width="4" height="12" fill="currentColor" opacity=".8" />
                <rect x="3" y="25" width="26" height="3" rx="1" fill="currentColor" opacity=".7" />
              </svg>
            )}
          </div>
          <h1 className="text-xl font-semibold text-foreground">{institutionName}</h1>
          <p className="text-sm text-muted-foreground">{institutionType}</p>
          {branding?.institutionCode && <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{branding.institutionCode}</p>}
        </div>

        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
        <span>&copy; {new Date().getFullYear()} {institutionName}. All rights reserved.</span>
        {branding?.contactEmail && <a className="underline underline-offset-2 hover:text-foreground" href={`mailto:${branding.contactEmail}`}>Contact support</a>}
      </footer>
    </div>
  );
}
