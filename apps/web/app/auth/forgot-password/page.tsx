import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset Password' };

// H12 FIX: Page is now a React Server Component.
// ForgotPasswordForm is the isolated 'use client' boundary.
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-72 rounded-lg bg-muted" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
