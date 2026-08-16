'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, ApiClientError } from '@/lib/api-client';

const schema = z
  .object({
    email: z.string().email('Valid email required'),
    otp: z
      .string()
      .regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
    newPassword: z
      .string()
      .min(12, 'At least 12 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/\d/, 'Must contain a digit')
      .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

type Form = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [done,    setDone]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: params.get('email') ?? '' },
  });

  const onSubmit = handleSubmit(async ({ email, otp, newPassword }) => {
    setError('');
    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { email, otp, newPassword });
      setDone(true);
      setTimeout(() => router.push('/auth/login'), 2500);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Reset failed. The OTP may be expired — request a new one.',
      );
    } finally {
      setLoading(false);
    }
  });

  if (done) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <CardTitle className="text-center">Password Reset!</CardTitle>
          <CardDescription className="text-center">
            Redirecting you to sign in&hellip;
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Set New Password</CardTitle>
        <CardDescription>
          Enter the 6-digit OTP from your email and choose a strong new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[--color-danger] dark:border-red-800 dark:bg-red-950/30"
          >
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" required>Email Address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@university.edu.ng"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="otp" required>6-Digit OTP</Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center font-mono text-xl tracking-widest"
              autoFocus
              error={errors.otp?.message}
              {...register('otp')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword" required>New Password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Min 12 chars — upper, lower, number, symbol"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm" required>Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              error={errors.confirm?.message}
              {...register('confirm')}
            />
          </div>

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Reset Password
          </Button>

          <div className="flex items-center justify-between text-sm">
            <Link href="/auth/forgot-password" className="text-muted-foreground transition-colors hover:text-foreground">
              Resend OTP
            </Link>
            <Link href="/auth/login" className="text-muted-foreground transition-colors hover:text-foreground">
              Back to Sign In
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-[520px] rounded-lg bg-muted" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
