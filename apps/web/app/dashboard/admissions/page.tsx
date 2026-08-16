'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/erp/confirm-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useCycles, useApplications, useUpdateApplicationStatus,
  useCreateCycle, useActivateCycle, useScreenBulk,
} from '@/hooks/use-admissions';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate } from '@/lib/utils';
import type { ApplicantV1 } from '@uniportal/types';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'badge-neutral', SCREENED: 'badge-info',
  OFFERED: 'badge-warning', ACCEPTED: 'badge-success',
  REJECTED: 'badge-danger', WITHDRAWN: 'badge-neutral', MATRICULATED: 'badge-success',
};

const ADMISSION_TYPES = ['UTME','DE','TRANSFER','POSTGRADUATE','SANDWICH','INTERNATIONAL','REMEDIAL'];

const cycleSchema = z.object({
  academicYear:   z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
  cycleName:      z.string().min(2),
  admissionType:  z.string().min(1),
  openDate:       z.string().min(1),
  closeDate:      z.string().min(1),
  utmeMinScore:   z.coerce.number().min(0).max(400).optional(),
});
type CycleForm = z.infer<typeof cycleSchema>;

export default function AdmissionsPage() {
  const user       = useAuthStore((s) => s.user);
  const canManage  = ['SUPER_ADMIN','REGISTRAR'].includes(user?.primaryRole ?? '');
  const isStaff    = ['SUPER_ADMIN','REGISTRAR','STAFF'].includes(user?.primaryRole ?? '');

  const [tab,             setTab]           = useState<'cycles'|'applications'>('applications');
  const [statusFilter,    setStatusFilter]  = useState('');
  const [typeFilter,      setTypeFilter]    = useState('');
  const [selectedCycleId, setSelectedCycle] = useState('');
  const [selectedApp,     setSelectedApp]   = useState<ApplicantV1 | null>(null);
  const [showCycleForm,   setShowCycleForm] = useState(false);
  const [actionError,     setActionError]   = useState('');
  const [screenResult,    setScreenResult]  = useState<{screened:number;rejected:number;skipped:number;dryRun:boolean}|null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [pendingRejection, setPendingRejection] = useState<ApplicantV1 | null>(null);

  const { data: cycles     = [] } = useCycles();
  const { data: apps       = [], isLoading } = useApplications({
    status:        statusFilter || undefined,
    admissionType: typeFilter   || undefined,
    cycleId:       selectedCycleId || undefined,
    pageSize: 100,
  });

  const { mutate: createCycle,  isPending: creating   } = useCreateCycle();
  const { mutate: activateCycle, isPending: activating } = useActivateCycle();
  const { mutate: updateStatus, isPending: updating   } = useUpdateApplicationStatus();
  const { mutate: screenBulk,   isPending: screening  } = useScreenBulk();

  const cycleForm = useForm<CycleForm>({ resolver: zodResolver(cycleSchema) });

  const handleCreateCycle = cycleForm.handleSubmit((data) => {
    setActionError('');
    createCycle(data, {
      onSuccess: () => { setShowCycleForm(false); cycleForm.reset(); },
      onError:   (e) => setActionError(e.message),
    });
  });

  const handleStatusUpdate = (id: string, status: string, reason?: string) => {
    setActionError('');
    updateStatus({ id, status, rejectionReason: reason }, {
      onSuccess: () => { setSelectedApp(null); setShowRejectionForm(false); setRejectionReason(''); },
      onError:   (e) => setActionError(e.message),
    });
  };

  const handleScreenBulk = (cycleId: string, dry = false) => {
    setActionError(''); setScreenResult(null);
    screenBulk({ admissionCycleId: cycleId, dryRun: dry }, {
      onSuccess: (r) => setScreenResult(r),
      onError:   (e) => setActionError(e.message),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Admissions</h2>
        <div className="flex gap-2">
          <button onClick={() => setTab('applications')} className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors', tab==='applications' ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>Applications</button>
          <button onClick={() => setTab('cycles')} className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors', tab==='cycles' ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>Cycles</button>
        </div>
      </div>

      {actionError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{actionError}</div>}
      <ConfirmAction
        open={!!pendingRejection}
        title="Reject admission application"
        description={`Confirm rejection of ${pendingRejection?.applicationNo ?? 'this application'}. The applicant-facing decision and the supplied reason will be recorded.`}
        confirmLabel="Confirm rejection"
        destructive
        onCancel={() => setPendingRejection(null)}
        onConfirm={() => {
          if (!pendingRejection) return;
          handleStatusUpdate(pendingRejection.id, 'REJECTED', rejectionReason.trim());
          setPendingRejection(null);
        }}
      />

      {/* ── Cycles tab ──────────────────────────────────────────────────── */}
      {tab === 'cycles' && (
        <div className="space-y-4">
          {canManage && (
            <Button size="sm" onClick={() => setShowCycleForm(!showCycleForm)}>
              {showCycleForm ? 'Cancel' : '+ New Cycle'}
            </Button>
          )}
          {showCycleForm && (
            <Card className="border-[--color-primary]/30">
              <CardContent className="pt-4">
                <form onSubmit={handleCreateCycle} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { id:'academicYear', label:'Academic Year', ph:'2025/2026' },
                    { id:'cycleName', label:'Cycle Name', ph:'Main Admission 2025' },
                    { id:'openDate', label:'Open Date', type:'date' },
                    { id:'closeDate', label:'Close Date', type:'date' },
                    { id:'utmeMinScore', label:'UTME Min Score', type:'number' },
                  ].map(({ id, label, ph, type='text' }) => (
                    <div key={id} className="space-y-1">
                      <Label htmlFor={id}>{label}</Label>
                      <Input id={id} type={type} placeholder={ph} {...cycleForm.register(id as keyof CycleForm)} />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label htmlFor="admissionType">Type</Label>
                    <select id="admissionType" {...cycleForm.register('admissionType')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {ADMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Button type="submit" size="sm" loading={creating}>Create Cycle</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cycles.map((c) => (
              <Card key={c.id} className="border-border">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{c.cycleName}</p>
                      <p className="text-xs text-muted-foreground">{c.academicYear} · {c.admissionType}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(c.openDate)} → {formatDate(c.closeDate)}
                      </p>
                      {c.utmeMinScore && <p className="text-xs text-muted-foreground">Cut-off: {c.utmeMinScore}</p>}
                      <p className="text-xs text-muted-foreground">{c._count?.applicants ?? 0} applicant(s)</p>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', c.isActive ? 'badge-success' : 'badge-neutral')}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {canManage && !c.isActive && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" loading={activating}
                        onClick={() => activateCycle(c.id, { onError: (e) => setActionError(e.message) })}>
                        Activate
                      </Button>
                      <Button size="sm" variant="outline" loading={screening}
                        onClick={() => handleScreenBulk(c.id, true)}>
                        Dry-run Screen
                      </Button>
                      {c.admissionType === 'UTME' && (
                        <Button size="sm" loading={screening}
                          onClick={() => { if (confirm('Screen all PENDING applicants against UTME cut-off?')) handleScreenBulk(c.id, false); }}>
                          Screen Applicants
                        </Button>
                      )}
                    </div>
                  )}
                  {screenResult && (
                    <div className="mt-2 rounded-md bg-blue-50 border border-blue-200 p-2 text-xs dark:bg-blue-950/20">
                      {screenResult.dryRun ? '(Dry run) ' : ''}
                      Screened: {screenResult.screened} · Rejected: {screenResult.rejected} · Skipped: {screenResult.skipped}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {cycles.length === 0 && <p className="col-span-3 text-sm text-muted-foreground">No admission cycles yet.</p>}
          </div>
        </div>
      )}

      {/* ── Applications tab ─────────────────────────────────────────────── */}
      {tab === 'applications' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All Statuses</option>
              {['PENDING','SCREENED','OFFERED','ACCEPTED','REJECTED','WITHDRAWN','MATRICULATED'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All Types</option>
              {ADMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={selectedCycleId} onChange={(e) => setSelectedCycle(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All Cycles</option>
              {cycles.map((c) => <option key={c.id} value={c.id}>{c.cycleName} ({c.academicYear})</option>)}
            </select>
          </div>

          {/* Application detail panel */}
          {selectedApp && (
            <Card className="border-[--color-primary]/30">
              <CardHeader className="pb-3 flex-row items-start justify-between">
                <CardTitle className="text-sm">{selectedApp.firstName} {selectedApp.lastName} — {selectedApp.applicationNo}</CardTitle>
                <button onClick={() => setSelectedApp(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Email:</span> {selectedApp.email}</div>
                  <div><span className="text-muted-foreground">Phone:</span> {selectedApp.phone}</div>
                  <div><span className="text-muted-foreground">Type:</span> {selectedApp.admissionType}</div>
                  <div><span className="text-muted-foreground">JAMB:</span> {selectedApp.jambRegNo ?? '—'} ({selectedApp.jambScore ?? '?'} pts) {selectedApp.jambVerified ? '✓' : '⏳'}</div>
                  <div><span className="text-muted-foreground">Programme:</span> {selectedApp.programmeChoice1Name ?? selectedApp.programmeChoice1Id.slice(0,8)}</div>
                  <div><span className="text-muted-foreground">Status:</span> <span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_COLORS[selectedApp.status])}>{selectedApp.status}</span></div>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    {selectedApp.status === 'PENDING' && (
                      <Button size="sm" onClick={() => handleStatusUpdate(selectedApp.id,'SCREENED')} loading={updating}>Mark Screened</Button>
                    )}
                    {selectedApp.status === 'SCREENED' && (
                      <Button size="sm" onClick={() => handleStatusUpdate(selectedApp.id,'OFFERED')} loading={updating}>Release Offer</Button>
                    )}
                    {selectedApp.status === 'OFFERED' && (
                      <Button size="sm" onClick={() => handleStatusUpdate(selectedApp.id,'ACCEPTED')} loading={updating}>Mark Accepted</Button>
                    )}
                    {!['REJECTED','WITHDRAWN','MATRICULATED'].includes(selectedApp.status) && (
                      <Button size="sm" variant="destructive" loading={updating} onClick={() => setShowRejectionForm(true)}>Reject</Button>
                    )}
                  </div>
                )}
                {showRejectionForm && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2 dark:bg-red-950/20">
                    <label htmlFor="admission-rejection-reason" className="text-xs font-medium">Reason for rejection</label>
                    <textarea id="admission-rejection-reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3}
                      placeholder="Explain the decision clearly for the applicant" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setShowRejectionForm(false); setRejectionReason(''); }}>Cancel</Button>
                      <Button size="sm" variant="destructive" disabled={rejectionReason.trim().length < 10} loading={updating}
                        onClick={() => { if (selectedApp) setPendingRejection(selectedApp); }}>Review rejection</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Applications table */}
          {isLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="h-10 animate-pulse rounded bg-muted"/>)}</div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {['App No','Name','Type','JAMB','Programme','Status','Applied'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {apps.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No applications found.</td></tr>
                  )}
                  {apps.map((a) => (
                    <tr key={a.id}
                      className={cn('transition-colors', selectedApp?.id === a.id && 'bg-[--color-primary]/10 ring-1 ring-inset ring-[--color-primary]')}>
                      <td className="px-4 py-2.5 font-mono text-xs text-[--color-primary]">
                        {isStaff ? <button type="button" onClick={() => setSelectedApp(a)} className="rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]" aria-label={`Review application ${a.applicationNo}`}>{a.applicationNo}</button> : a.applicationNo}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{a.firstName} {a.lastName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{a.admissionType}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{a.jambScore ?? '—'} {a.jambVerified ? '✓' : ''}</td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[120px]">{a.programmeChoice1Name ?? '—'}</td>
                      <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[a.status]??'badge-neutral')}>{a.status}</span></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
