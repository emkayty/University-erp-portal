'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useFeeSchedules, useCreateFeeSchedule, useGenerateInvoices,
  useStudentFees, useInitiatePayment, usePaymentHistory,
  useRequestWaiver, usePendingWaivers, useApproveWaiver, useRejectWaiver,
} from '@/hooks/use-fees';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate, formatNgn } from '@/lib/utils';
import type { StudentFeeV1 } from '@uniportal/types';

const FEE_TYPES = ['TUITION','ACCEPTANCE','ACCOMMODATION','LIBRARY','MEDICAL','SPORTS','ICT','EXAM_FEE','LATE_REG','OTHER'];

const STATUS_COLORS: Record<string,string> = {
  PENDING:'badge-neutral', PARTIAL:'badge-warning', PAID:'badge-success',
  WAIVED:'badge-info', OVERDUE:'badge-danger',
};

const scheduleSchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
  feeType:      z.string().min(1),
  amount:       z.coerce.number().min(0),
  level:        z.coerce.number().min(100).max(800).optional(),
  description:  z.string().optional(),
  dueDate:      z.string().optional(),
});
type ScheduleForm = z.infer<typeof scheduleSchema>;

const waiverSchema = z.object({
  waiverPct: z.coerce.number().min(0.01).max(100),
  reason:    z.string().min(10, 'Minimum 10 characters'),
});
type WaiverForm = z.infer<typeof waiverSchema>;

export default function FeesPage() {
  const user = useAuthStore((s) => s.user);
  const role = user?.primaryRole ?? '';
  const isStudent = role === 'STUDENT';
  const isBursar  = ['BURSAR','SUPER_ADMIN'].includes(role);
  const isHod     = role === 'HOD';
  const canWaive  = isHod || isBursar;

  const [tab, setTab] = useState<'my'|'schedules'|'waivers'>(isStudent ? 'my' : 'schedules');
  const [actionError, setError]   = useState('');
  const [actionMsg,   setMsg]     = useState('');
  const [selectedFeeId, setSelFeeId] = useState('');
  const [showWaiverForm, setShowWaiver] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  // Retained for the page lifetime so a retry after a slow/uncertain network
  // response addresses the same payment attempt rather than opening a second
  // provider session for the same fee.
  const [paymentAttemptKeys, setPaymentAttemptKeys] = useState<Record<string, string>>({});

  const studentId = isStudent ? (user?.studentId ?? '') : '';

  const { data: schedules = [] } = useFeeSchedules();
  const { data: myFees    = [], isLoading: feesLoading } = useStudentFees(studentId);
  const { data: history   = [] } = usePaymentHistory(studentId);
  const { data: pendingWaivers = [] } = usePendingWaivers();

  const { mutate: createSchedule,   isPending: creatingSchedule } = useCreateFeeSchedule();
  const { mutate: generateInvoices, isPending: generating }       = useGenerateInvoices();
  const { mutate: initiatePayment,  isPending: initiating }       = useInitiatePayment();
  const { mutate: requestWaiver,    isPending: requestingWaiver } = useRequestWaiver();
  const { mutate: approveWaiver,    isPending: approving }        = useApproveWaiver();
  const { mutate: rejectWaiver,     isPending: rejecting  }       = useRejectWaiver();

  const scheduleForm = useForm<ScheduleForm>({ resolver: zodResolver(scheduleSchema) });
  const waiverForm   = useForm<WaiverForm>({ resolver: zodResolver(waiverSchema) });

  const handleCreateSchedule = scheduleForm.handleSubmit((data) => {
    setError('');
    createSchedule(data, {
      onSuccess: () => { setShowScheduleForm(false); scheduleForm.reset(); },
      onError:   (e) => setError(e.message),
    });
  });

  const handleGenerate = (scheduleId: string) => {
    setError(''); setMsg('');
    generateInvoices(scheduleId, {
      onSuccess: (r) => setMsg(`${r.message} (job ${r.jobId})`),
      onError:   (e) => setError(e.message),
    });
  };

  const handlePay = (fee: StudentFeeV1, provider: 'PAYSTACK'|'REMITA') => {
    setError(''); setMsg('');
    const idempotencyKey = paymentAttemptKeys[fee.id] ?? crypto.randomUUID();
    if (!paymentAttemptKeys[fee.id]) {
      setPaymentAttemptKeys((current) => ({ ...current, [fee.id]: idempotencyKey }));
    }
    initiatePayment({ studentFeeId: fee.id, provider, idempotencyKey }, {
      onSuccess: (r) => {
        if (provider === 'PAYSTACK') {
          try {
            const checkout = new URL(r.reference);
            const trustedPaystackHost = checkout.protocol === 'https:'
              && (checkout.hostname === 'paystack.com' || checkout.hostname.endsWith('.paystack.com'));
            if (!trustedPaystackHost) throw new Error('The payment provider returned an untrusted checkout URL.');
            // External payment navigation is intentional: the callback returns
            // to this dashboard, while final fee status is server-verified.
            window.location.assign(checkout.toString());
            return;
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not open the secure payment checkout.');
            return;
          }
        }
        setMsg(`Remita RRR generated: ${r.reference}. Complete payment through your approved Remita channel; fee status will update after server verification.`);
      },
      onError:   (e) => setError(e.message),
    });
  };

  const handleRequestWaiver = waiverForm.handleSubmit((data) => {
    if (!selectedFeeId) return;
    setError('');
    requestWaiver({ studentFeeId: selectedFeeId, ...data }, {
      onSuccess: (w) => {
        setMsg(w.status === 'APPROVED' ? '✓ Waiver approved and applied immediately' : '✓ Waiver request submitted — pending Bursar approval');
        setShowWaiver(false); waiverForm.reset(); setSelFeeId('');
      },
      onError: (e) => setError(e.message),
    });
  });

  const outstanding = (fee: StudentFeeV1) =>
    parseFloat(fee.amount) - parseFloat(fee.waiverAmount) - parseFloat(fee.amountPaid);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">Fees & Payments</h2>
        <div className="flex gap-2">
          {isStudent && (
            <button onClick={() => setTab('my')} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab==='my'?'bg-[--color-primary] text-white':'bg-muted text-muted-foreground hover:text-foreground')}>My Fees</button>
          )}
          {!isStudent && (
            <button onClick={() => setTab('schedules')} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab==='schedules'?'bg-[--color-primary] text-white':'bg-muted text-muted-foreground hover:text-foreground')}>Fee Schedules</button>
          )}
          {canWaive && (
            <button onClick={() => setTab('waivers')} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab==='waivers'?'bg-[--color-primary] text-white':'bg-muted text-muted-foreground hover:text-foreground')}>
              Waivers {pendingWaivers.length > 0 && isBursar && <span className="ml-1 rounded-full bg-amber-200 px-1.5 text-xs text-amber-800">{pendingWaivers.length}</span>}
            </button>
          )}
        </div>
      </div>

      {actionError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{actionError}</div>}
      {actionMsg    && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-950/20">{actionMsg}</div>}

      {/* ── My Fees (Student) ────────────────────────────────────────────── */}
      {tab === 'my' && (
        <div className="space-y-4">
          {feesLoading ? (
            <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-16 animate-pulse rounded bg-muted"/>)}</div>
          ) : myFees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fee invoices yet for this academic session.</p>
          ) : (
            <div className="space-y-3">
              {myFees.map((fee) => (
                <Card key={fee.id} className={cn(fee.status==='OVERDUE' && 'border-red-300')}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{fee.feeSchedule?.feeType.replace('_',' ')}</p>
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[fee.status])}>{fee.status}</span>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">{fee.invoiceNo}</p>
                        <p className="text-xs text-muted-foreground">{fee.academicYear} {fee.dueDate && `· Due ${formatDate(fee.dueDate)}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-foreground">{formatNgn(parseFloat(fee.amount))}</p>
                        {parseFloat(fee.waiverAmount) > 0 && <p className="text-xs text-[--color-success]">Waiver: -{formatNgn(parseFloat(fee.waiverAmount))}</p>}
                        {parseFloat(fee.amountPaid) > 0 && <p className="text-xs text-muted-foreground">Paid: {formatNgn(parseFloat(fee.amountPaid))}</p>}
                        {fee.status !== 'PAID' && fee.status !== 'WAIVED' && (
                          <p className="text-sm font-semibold text-[--color-danger]">Owing: {formatNgn(outstanding(fee))}</p>
                        )}
                      </div>
                    </div>
                    {fee.status !== 'PAID' && fee.status !== 'WAIVED' && (
                      <div className="mt-3 flex gap-2 border-t border-border pt-3">
                        <Button size="sm" loading={initiating} onClick={() => handlePay(fee, 'PAYSTACK')}>Pay with Paystack</Button>
                        <Button size="sm" variant="outline" loading={initiating} onClick={() => handlePay(fee, 'REMITA')}>Pay with Remita</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Payment History</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {history.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">{p.providerRef}</span>
                        <span className="ml-2 text-muted-foreground">{p.provider} · {p.studentFee?.invoiceNo}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium">{formatNgn(parseFloat(p.amount))}</span>
                        <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs', p.status==='SUCCESS'?'badge-success':p.status==='PENDING'?'badge-neutral':'badge-danger')}>{p.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Fee Schedules (Bursar/Registrar/HOD admin) ──────────────────────── */}
      {tab === 'schedules' && (
        <div className="space-y-4">
          {isBursar && (
            <Button size="sm" onClick={() => setShowScheduleForm(!showScheduleForm)}>
              {showScheduleForm ? 'Cancel' : '+ New Fee Schedule'}
            </Button>
          )}
          {showScheduleForm && (
            <Card className="border-[--color-primary]/30">
              <CardContent className="pt-4">
                <form onSubmit={handleCreateSchedule} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="academicYear" required>Academic Year</Label>
                    <Input id="academicYear" placeholder="2025/2026" error={scheduleForm.formState.errors.academicYear?.message} {...scheduleForm.register('academicYear')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="feeType" required>Fee Type</Label>
                    <select id="feeType" {...scheduleForm.register('feeType')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {FEE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="amount" required>Amount (₦)</Label>
                    <Input id="amount" type="number" min={0} step="0.01" error={scheduleForm.formState.errors.amount?.message} {...scheduleForm.register('amount')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="level">Level (optional — all if blank)</Label>
                    <Input id="level" type="number" min={100} max={800} step={100} placeholder="100" {...scheduleForm.register('level')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input id="dueDate" type="date" {...scheduleForm.register('dueDate')} />
                  </div>
                  <div className="space-y-1 lg:col-span-1">
                    <Label htmlFor="description">Description</Label>
                    <Input id="description" placeholder="Optional note" {...scheduleForm.register('description')} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Button type="submit" size="sm" loading={creatingSchedule}>Create Schedule</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {['Type','Programme','Level','Year','Amount','Due','Status', isBursar?'Actions':''].filter(Boolean).map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schedules.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No fee schedules yet.</td></tr>}
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 text-foreground">{s.feeType.replace('_',' ')}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.programmeCode ?? 'All'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.level ?? 'All'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.academicYear}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{formatNgn(parseFloat(s.amount))}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.dueDate ? formatDate(s.dueDate) : '—'}</td>
                    <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs',s.isActive?'badge-success':'badge-neutral')}>{s.isActive?'Active':'Inactive'}</span></td>
                    {isBursar && (
                      <td className="px-4 py-2.5">
                        <Button size="sm" variant="outline" loading={generating} onClick={() => handleGenerate(s.id)}>Generate Invoices</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Waivers (HOD/Bursar) ─────────────────────────────────────────────── */}
      {tab === 'waivers' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Request Fee Waiver</CardTitle>
              <CardDescription className="text-xs">
                {isHod ? 'HOD requests go to Bursar for approval (cap applies).' : 'Bursar approvals are applied immediately (cap applies).'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!showWaiverForm ? (
                <div className="space-y-2">
                  <Label htmlFor="feeIdLookup">Student Fee (Invoice) ID</Label>
                  <div className="flex gap-2">
                    <Input id="feeIdLookup" placeholder="UUID of the StudentFee record"
                      value={selectedFeeId} onChange={(e) => setSelFeeId(e.target.value)} />
                    <Button size="sm" disabled={!selectedFeeId} onClick={() => setShowWaiver(true)}>Continue</Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRequestWaiver} className="space-y-3 max-w-md">
                  <p className="text-xs text-muted-foreground font-mono">Fee ID: {selectedFeeId}</p>
                  <div className="space-y-1">
                    <Label htmlFor="waiverPct" required>Waiver Percentage</Label>
                    <Input id="waiverPct" type="number" min={0.01} max={100} step="0.01"
                      error={waiverForm.formState.errors.waiverPct?.message} {...waiverForm.register('waiverPct')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reason" required>Reason</Label>
                    <Input id="reason" placeholder="e.g. Documented financial hardship — see attached letter"
                      error={waiverForm.formState.errors.reason?.message} {...waiverForm.register('reason')} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={requestingWaiver}>Submit Request</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setShowWaiver(false); setSelFeeId(''); }}>Cancel</Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {isBursar && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pending Waiver Approvals ({pendingWaivers.length})</CardTitle></CardHeader>
              <CardContent>
                {pendingWaivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending waiver requests.</p>
                ) : (
                  <div className="space-y-2">
                    {pendingWaivers.map((w) => (
                      <div key={w.id} className="rounded-md border border-border p-3">
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {w.studentFee?.student.firstName} {w.studentFee?.student.lastName} — {w.studentFee?.invoiceNo}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{w.reason}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {w.waiverPct}% = {formatNgn(parseFloat(w.waiverAmount))} of {formatNgn(parseFloat(w.studentFee?.amount ?? '0'))}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <Button size="sm" loading={approving} onClick={() => approveWaiver(w.id, { onError: (e) => setError(e.message) })}>Approve</Button>
                            <Button size="sm" variant="destructive" loading={rejecting}
                              onClick={() => { if (window.confirm(`Reject the waiver request for invoice ${w.studentFee?.invoiceNo ?? 'this invoice'}?`)) rejectWaiver({ id: w.id }, { onError: (e) => setError(e.message) }); }}>
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
