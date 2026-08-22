'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/erp/confirm-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';
import { effectiveRolesOf, hasEffectiveRole } from '@/lib/authz';
import { apiClient } from '@/lib/api-client';

export default function PrivacyPage() {
  const user = useAuthStore((s) => s.user);
  const role = effectiveRolesOf(user)[0] ?? '';
  const [subjectId, setSubjectId] = useState(user?.studentId ?? user?.id ?? '');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [vcApprovalReference, setVcApprovalReference] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [eraseConfirmationOpen, setEraseConfirmationOpen] = useState(false);
  const selfOrDpo = role === 'SUPER_ADMIN' || role === 'STAFF' || subjectId === user?.studentId;
  const act = async (operation: () => Promise<unknown>, success: string) => { setBusy(true); setMessage(''); try { await operation(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : 'The privacy operation failed.'); } finally { setBusy(false); } };

  return <div className="erp-workspace-page">
    <ConfirmAction
      open={eraseConfirmationOpen}
      title="Confirm privacy erasure request"
      description="This is an irreversible privacy operation. The request will be checked against legal holds and recorded with the VC approval reference."
      confirmLabel="Request erasure"
      destructive
      onCancel={() => setEraseConfirmationOpen(false)}
      onConfirm={() => {
        setEraseConfirmationOpen(false);
        void act(() => apiClient.delete(`/privacy/erase/${subjectId}`, { vcApprovalReference, reason }), 'Erasure completed and compliance evidence recorded.');
      }}
    />
    <header className="erp-workspace-header"><p className="text-sm text-muted-foreground">Data-subject rights and compliance evidence</p><h1 className="text-2xl font-semibold">Privacy Operations</h1><p className="mt-1 text-sm text-muted-foreground">Requests create durable records and, where necessary, asynchronous export jobs. Use a verified subject identifier and avoid placing sensitive details in free-text notes.</p></header>
    {message && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</div>}
    <Card><CardHeader><CardTitle>Subject and request details</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><label className="text-sm md:col-span-2">Subject UUID<Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={role !== 'SUPER_ADMIN' && role !== 'STAFF'} className="mt-1" /></label><label className="text-sm">Replacement email<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className="mt-1" /></label><label className="text-sm">Replacement phone<Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" className="mt-1" /></label><label className="text-sm md:col-span-2">Reason or case note<textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2" placeholder="Explain the operational basis for this request." /></label></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>Access and portability</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button disabled={!selfOrDpo || busy} onClick={() => act(() => apiClient.get(`/privacy/sar/${subjectId}`), 'Access request recorded; the export will be processed asynchronously.')}>Request access</Button><Button variant="outline" disabled={!selfOrDpo || busy} onClick={() => act(() => apiClient.get(`/privacy/export/${subjectId}`), 'Portability export queued.')}>Queue portability export</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>Rectification and restriction</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" disabled={!selfOrDpo || busy || (!email && !phone)} onClick={() => act(() => apiClient.post(`/privacy/rectify/${subjectId}`, { email: email || undefined, phone: phone || undefined, reason: reason || undefined }), 'Rectification completed and audited.')}>Apply rectification</Button><Button variant="outline" disabled={!hasEffectiveRole(user, 'SUPER_ADMIN', 'STAFF', 'SUPPORT_STAFF')} onClick={() => act(() => apiClient.post(`/privacy/restrict/${subjectId}`, { reason: reason || 'Operational privacy restriction requested' }), 'Processing restriction recorded.')}>Restrict processing</Button></CardContent></Card>
    </div>
    {hasEffectiveRole(user, 'SUPER_ADMIN') && <Card className="border-red-200"><CardHeader><CardTitle className="text-red-800">Controlled erasure</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Erasure requires a distinct active VC approval reference. Academic legal holds result in pseudonymisation rather than hard deletion.</p><Input value={vcApprovalReference} onChange={(e) => setVcApprovalReference(e.target.value)} placeholder="Active VC user UUID" /><Button variant="destructive" disabled={busy || !vcApprovalReference || !reason || !confirmReady(subjectId)} onClick={() => setEraseConfirmationOpen(true)}>Request erasure</Button></CardContent></Card>}
  </div>;
}
function confirmReady(id: string) { return id.trim().length > 10; }
