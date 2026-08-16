'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, ApiClientError } from '@/lib/api-client';

const schema = z.object({ email: z.string().email('Please enter a valid email address') });
type Form = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { register, handleSubmit, getValues, formState: { errors } } =
    useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    setError(''); setLoading(true);
    try { await apiClient.post('/auth/forgot-password', data); setSent(true); }
    catch (err) { setError(err instanceof ApiClientError ? err.message : 'Something went wrong.'); }
    finally { setLoading(false); }
  });

  if (sent) return (
    <Card className="glass-card">
      <CardHeader>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <CardTitle className="text-center">Check your email</CardTitle>
        <CardDescription className="text-center">A 6-digit OTP was sent to <strong>{getValues('email')}</strong>. Expires in 10 minutes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Link href="/auth/reset-password"><Button className="w-full">Enter OTP →</Button></Link>
        <Link href="/auth/login"><Button className="w-full" variant="outline">Back to Sign In</Button></Link>
      </CardContent>
    </Card>
  );

  return (
    <Card className="glass-card">
      <CardHeader><CardTitle>Reset Password</CardTitle><CardDescription>Enter your institutional email to receive a reset code.</CardDescription></CardHeader>
      <CardContent>
        {error && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[--color-danger]">{error}</div>}
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" required>Email Address</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@university.edu.ng" autoFocus error={errors.email?.message} {...register('email')} />
          </div>
          <Button type="submit" className="w-full" loading={loading}>Send Reset Code</Button>
          <Link href="/auth/login" className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to Sign In</Link>
        </form>
      </CardContent>
    </Card>
  );
}
