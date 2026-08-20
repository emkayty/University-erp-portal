'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button }      from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input }       from '@/components/ui/input';
import { Label }       from '@/components/ui/label';
import { ApiClientError, apiClient, setAccessToken } from '@/lib/api-client';
import type { MfaSetupResponse } from '@uniportal/types';
import { useAuthStore } from '@/stores/auth.store';

// ── Schemas ───────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email:    z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const mfaSchema = z.object({
  totpCode: z.string().regex(/^\d{6}$/, 'Must be exactly 6 digits'),
});

const backupSchema = z.object({
  backupCode: z.string().length(8, 'Backup code must be exactly 8 characters').toUpperCase(),
});

type LoginForm   = z.infer<typeof loginSchema>;
type MfaForm     = z.infer<typeof mfaSchema>;
type BackupForm  = z.infer<typeof backupSchema>;

type Step = 'credentials' | 'mfa' | 'backup' | 'mfa-setup';

function safeInternalRedirect(value: string | null): string {
  if (!value) return '/dashboard';
  try {
    const parsed = new URL(value, 'https://uniportal.invalid');
    if (parsed.origin !== 'https://uniportal.invalid' || !parsed.pathname.startsWith('/')) return '/dashboard';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/dashboard';
  }
}

export function LoginForm() {
  const router       = useRouter();
  const params       = useSearchParams();
  const from         = safeInternalRedirect(params.get('from'));
  const { login, verifyMfa } = useAuthStore();

  const [step,     setStep]     = useState<Step>('credentials');
  const [mfaToken, setMfaToken] = useState<string>('');
  const [setupToken, setSetupToken] = useState<string>('');
  const [setupSecret, setSetupSecret] = useState<string>('');
  const [setupQrCodeUri, setSetupQrCodeUri] = useState<string>('');
  const [error,    setError]    = useState<string>('');
  const [loading,  setLoading]  = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  // ── Credentials form ───────────────────────────────────────────────────────
  const credForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const handleCredentials = credForm.handleSubmit(async (data) => {
    setError('');
    setLoading(true);
    try {
      const result = await login(data);
      if (result && 'requiresMfa' in result && result.requiresMfa) {
        setMfaToken(result.mfaToken);
        setStep('mfa');
      } else if (result && 'requiresMfaSetup' in result && result.requiresMfaSetup) {
        setSetupToken(result.setupToken);
        const setup = await apiClient.post<MfaSetupResponse>('/auth/mfa/setup-mandatory', { setupToken: result.setupToken });
        setSetupSecret(setup.secret);
        setSetupQrCodeUri(setup.qrCodeUri);
        setStep('mfa-setup');
      } else {
        // Set session indicator cookie only after a real access token was issued.
        document.cookie = `session_active=1; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
        router.replace(from);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // ── Mandatory MFA setup form ────────────────────────────────────────────────
  const setupForm = useForm<MfaForm>({ resolver: zodResolver(mfaSchema) });

  const handleMandatoryMfaSetup = setupForm.handleSubmit(async (data) => {
    setError('');
    setLoading(true);
    try {
      const result = await apiClient.post<{ accessToken: string; user: import('@uniportal/types').UserV1; backupCodes: string[] }>(
        '/auth/mfa/confirm-setup-mandatory',
        { setupToken, totpCode: data.totpCode, secret: setupSecret },
      );
      setAccessToken(result.accessToken);
      useAuthStore.getState().setUser(result.user);
      document.cookie = `session_active=1; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
      router.replace(from);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to complete mandatory MFA setup.');
    } finally {
      setLoading(false);
    }
  });

  // ── MFA form ───────────────────────────────────────────────────────────────
  const mfaForm = useForm<MfaForm>({ resolver: zodResolver(mfaSchema) });

  const handleMfa = mfaForm.handleSubmit(async (data) => {
    setError('');
    setLoading(true);
    try {
      await verifyMfa({ mfaToken, totpCode: data.totpCode });
      document.cookie = `session_active=1; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
      router.replace(from);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // ── Backup code form ───────────────────────────────────────────────────────
  const backupForm = useForm<BackupForm>({ resolver: zodResolver(backupSchema) });

  const handleBackup = backupForm.handleSubmit(async (data) => {
    setError('');
    setLoading(true);
    try {
      const result = await apiClient.post<{ accessToken: string; user: import('@uniportal/types').UserV1 }>(
        '/auth/mfa/verify-backup',
        { mfaToken, backupCode: data.backupCode.toUpperCase() },
      );
      useAuthStore.getState().setUser(result.user);
      setAccessToken(result.accessToken);
      document.cookie = `session_active=1; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
      router.replace(from);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Invalid backup code.');
    } finally {
      setLoading(false);
    }
  });

  const restartSignIn = () => {
    setError('');
    setMfaToken('');
    setSetupToken('');
    setSetupSecret('');
    setSetupQrCodeUri('');
    setStep('credentials');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (step === 'mfa-setup') {
    return (
      <Card className="enterprise-surface rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Set Up Required MFA</CardTitle>
          <CardDescription>Your role requires multi-factor authentication before access can be granted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-blue-200/70 bg-blue-50/70 p-3 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>Multi-factor authentication protects sensitive university records. Keep your authenticator and backup codes private.</p>
          </div>
          {error && <div role="alert" className="rounded-md border border-[--color-danger]/30 bg-red-50 px-4 py-3 text-sm text-[--color-danger]">{error}</div>}
          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Add this account to your authenticator app.</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{setupSecret}</p>
            {setupQrCodeUri && <a className="mt-2 inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-[--color-primary] underline underline-offset-4" href={setupQrCodeUri}>Open authenticator app</a>}
            <p className="mt-2 text-xs text-muted-foreground">If your device cannot open the link, enter the secret manually in any TOTP-compatible authenticator.</p>
          </div>
          <form onSubmit={handleMandatoryMfaSetup} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mandatoryTotpCode" required>Authenticator Code</Label>
              <Input id="mandatoryTotpCode" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus error={setupForm.formState.errors.totpCode?.message} {...setupForm.register('totpCode')} />
            </div>
            <Button type="submit" className="w-full" loading={loading}>Complete MFA setup</Button>
          </form>
          <div className="mt-3 text-center">
            <button type="button" onClick={restartSignIn} className="min-h-11 px-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Start over</button>
          </div>
        </CardContent>
        </Card>
      );
    }

    if (step === 'mfa' || step === 'backup') {
    return (
      <Card className="enterprise-surface rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>{step === 'mfa' ? 'Two-Factor Verification' : 'Backup Code'}</CardTitle>
          <CardDescription>
            {step === 'mfa'
              ? 'Enter the 6-digit code from your authenticator app.'
              : 'Enter one of your 8-character backup codes.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div role="alert" className="mb-4 rounded-md border border-[--color-danger]/30 bg-red-50 px-4 py-3 text-sm text-[--color-danger]">
              {error}
            </div>
          )}

          {step === 'mfa' ? (
            <form onSubmit={handleMfa} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="totpCode" required>Authenticator Code</Label>
                <Input
                  id="totpCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-2xl tracking-widest font-mono"
                  autoFocus
                  error={mfaForm.formState.errors.totpCode?.message}
                  {...mfaForm.register('totpCode')}
                />
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                Verify
              </Button>
              <button
                type="button"
                onClick={() => setStep('backup')}
                className="w-full min-h-11 text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Use a backup code instead
              </button>
              <button type="button" onClick={restartSignIn} className="w-full min-h-11 text-center text-sm text-muted-foreground hover:text-foreground transition-colors">Start over</button>
            </form>
          ) : (
            <form onSubmit={handleBackup} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="backupCode" required>Backup Code</Label>
                <Input
                  id="backupCode"
                  type="text"
                  autoComplete="off"
                  maxLength={8}
                  placeholder="A3F9B2D1"
                  className="text-center text-lg tracking-widest font-mono uppercase"
                  autoFocus
                  error={backupForm.formState.errors.backupCode?.message}
                  {...backupForm.register('backupCode')}
                />
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                Verify Backup Code
              </Button>
              <button
                type="button"
                onClick={() => setStep('mfa')}
                className="w-full min-h-11 text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to authenticator code
              </button>
              <button type="button" onClick={restartSignIn} className="w-full min-h-11 text-center text-sm text-muted-foreground hover:text-foreground transition-colors">Start over</button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="enterprise-surface rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>Enter your institutional credentials to continue</CardDescription>
      </CardHeader>
      <CardContent>
        {params.get('reason') === 'session_expired' && (
          <div role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your session has expired. Please sign in again.
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 rounded-md border border-[--color-danger]/30 bg-red-50 px-4 py-3 text-sm text-[--color-danger]">
            {error}
          </div>
        )}

        <form onSubmit={handleCredentials} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" required>Email Address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@university.edu.ng"
              autoFocus
              error={credForm.formState.errors.email?.message}
              {...credForm.register('email')}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" required>Password</Label>
              <Link
                href="/auth/forgot-password"
                className="inline-flex min-h-11 items-center text-xs text-[--color-primary] hover:underline focus-visible:outline-none focus-visible:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="pr-12"
                error={credForm.formState.errors.password?.message}
                {...credForm.register('password')}
              />
              <button type="button" onClick={() => setPasswordVisible((visible) => !visible)} className="absolute right-1 top-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible}>
                {passwordVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Sign In
          </Button>
          <p className="text-center text-xs leading-5 text-muted-foreground">Use your institutional account. If you need help, contact the authorized University support desk.</p>
        </form>
      </CardContent>
    </Card>
  );
}
