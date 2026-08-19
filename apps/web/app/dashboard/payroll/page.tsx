'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { usePayrollRuns, useCreatePayrollRun, usePayrollAction, useRunPayslips, useMyPayslips } from '@/hooks/use-payroll';
import { useAuthStore } from '@/stores/auth.store';
import { hasEffectiveRole } from '@/lib/authz';
import { cn, formatDate, formatNgn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import type { PayrollRunV1 } from '@uniportal/types';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'badge-neutral', COMPUTED: 'badge-info',
  APPROVED: 'badge-warning', DISBURSED: 'badge-success',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function PayrollPage() {
  const user   = useAuthStore((s) => s.user);
  const role = user?.effectiveRoles?.[0] ?? user?.primaryRole ?? '';
  const isStaff   = role === 'STAFF';
  const canManage = hasEffectiveRole(user, 'BURSAR', 'HR_MANAGER', 'SUPER_ADMIN');

  const [tab,        setTab]    = useState<'runs'|'payslips'>(isStaff ? 'payslips' : 'runs');
  const [selectedRun, setSel]   = useState<PayrollRunV1 | null>(null);
  const [actionErr,  setErr]    = useState('');
  const [actionMsg,  setMsg]    = useState('');
  const [year,       setYear]   = useState(new Date().getFullYear());
  const [showCreate, setCreate] = useState(false);
  const [form, setForm]         = useState({ periodMonth: 1, periodYear: year, label: '' });
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: runs = [],    isLoading }  = usePayrollRuns(year);
  const { data: payslips = [] }            = useRunPayslips(selectedRun?.id ?? '');
  const { data: myPayslips = [] }          = useMyPayslips(isStaff ? (user?.id ?? '') : '');

  const { mutate: createRun,  isPending: creating  } = useCreatePayrollRun();
  const { mutate: doAction,   isPending: actioning  } = usePayrollAction();

  const handleAction = (run: PayrollRunV1, action: string) => {
    setErr(''); setMsg('');
    doAction({ id: run.id, action }, {
      onSuccess: () => setMsg(`✓ "${action}" applied to ${run.label}`),
      onError:   (e) => setErr(e.message),
    });
  };

  const handleCreate = () => {
    if (!form.label) { setErr('Label is required'); return; }
    setErr('');
    createRun(form, {
      onSuccess: () => { setCreate(false); setForm({ periodMonth: 1, periodYear: year, label: '' }); },
      onError:   (e) => setErr(e.message),
    });
  };

  const nextAction = (status: string) => {
    if (status === 'DRAFT')    return 'COMPUTE';
    if (status === 'COMPUTED') return 'APPROVE';
    if (status === 'APPROVED') return 'DISBURSE';
    return null;
  };

  const handleExport = async (run: PayrollRunV1, format: 'ippis' | 'pencom') => {
    const key = `${run.id}:${format}`;
    setErr(''); setMsg(''); setDownloading(key);
    try {
      const { blob, filename } = await apiClient.download(`/payroll/runs/${run.id}/export/${format}`);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename ?? `${format}-${run.id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to download payroll export.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">Payroll</h2>
        <div className="flex gap-2">
          {!isStaff && <button onClick={() => setTab('runs')} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab==='runs'?'bg-[--color-primary] text-white':'bg-muted text-muted-foreground hover:text-foreground')}>Payroll Runs</button>}
          <button onClick={() => setTab('payslips')} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab==='payslips'?'bg-[--color-primary] text-white':'bg-muted text-muted-foreground hover:text-foreground')}>
            {isStaff ? 'My Payslips' : 'Payslips'}
          </button>
        </div>
      </div>

      {actionErr && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{actionErr}</div>}
      {actionMsg  && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{actionMsg}</div>}

      {/* ── Payroll Runs ─────────────────────────────────────────────────── */}
      {tab === 'runs' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              {[2024,2025,2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {canManage && (
              <Button size="sm" onClick={() => setCreate(!showCreate)}>
                {showCreate ? 'Cancel' : '+ New Payroll Run'}
              </Button>
            )}
          </div>

          {showCreate && (
            <Card className="border-[--color-primary]/30 max-w-md">
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Month</label>
                    <select value={form.periodMonth} onChange={(e) => setForm({ ...form, periodMonth: parseInt(e.target.value) })}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Year</label>
                    <input type="number" value={form.periodYear} min={2020} max={2099}
                      onChange={(e) => setForm({ ...form, periodYear: parseInt(e.target.value) })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Label</label>
                  <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="October 2025" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <Button size="sm" onClick={handleCreate} loading={creating}>Create Run</Button>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-20 animate-pulse rounded bg-muted"/>)}</div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payroll runs for {year}.</p>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => {
                const next = nextAction(run.status);
                return (
                  <Card key={run.id} className={cn(selectedRun?.id === run.id && 'border-[--color-primary]')}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{run.label}</p>
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[run.status])}>{run.status}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{run.staffCount} staff · Gross: {formatNgn(parseFloat(run.totalGross))} · Net: {formatNgn(parseFloat(run.totalNet))}</p>
                          {run.approvedAt  && <p className="text-xs text-muted-foreground">Approved: {formatDate(run.approvedAt)}</p>}
                          {run.disbursedAt && <p className="text-xs text-muted-foreground">Disbursed: {formatDate(run.disbursedAt)}</p>}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => { setSel(run); setTab('payslips'); }}>View Payslips</Button>
                          {canManage && next && (
                            <Button size="sm" loading={actioning} onClick={() => handleAction(run, next)}>{next}</Button>
                          )}
                          {canManage && run.status !== 'DRAFT' && (
                            <>
                              <Button size="sm" variant="outline" loading={downloading === `${run.id}:ippis`} onClick={() => void handleExport(run, 'ippis')}>IPPIS CSV</Button>
                              <Button size="sm" variant="outline" loading={downloading === `${run.id}:pencom`} onClick={() => void handleExport(run, 'pencom')}>PenCom CSV</Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Payslips ──────────────────────────────────────────────────────── */}
      {tab === 'payslips' && (
        <div className="space-y-4">
          {isStaff ? (
            myPayslips.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payslips on record yet.</p>
            ) : (
              <div className="space-y-3">
                {myPayslips.map((p) => (
                  <Card key={p.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{p.payrollRun?.label}</CardTitle>
                      <CardDescription className="text-xs">Grade: {p.gradeLevel}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                        <div><span className="text-muted-foreground">Basic:</span> {formatNgn(parseFloat(p.basicSalary))}</div>
                        <div><span className="text-muted-foreground">Gross:</span> {formatNgn(parseFloat(p.grossPay))}</div>
                        <div><span className="text-muted-foreground">PAYE:</span> -{formatNgn(parseFloat(p.payeeTax))}</div>
                        <div><span className="text-muted-foreground">Pension (EE):</span> -{formatNgn(parseFloat(p.pensionEmployee))}</div>
                        <div><span className="text-muted-foreground">NHF:</span> -{formatNgn(parseFloat(p.nhfDeduction))}</div>
                        <div className="text-[--color-success] font-semibold"><span className="text-muted-foreground">Net Pay:</span> {formatNgn(parseFloat(p.netPay))}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : (
            selectedRun ? (
              <>
                <p className="text-sm text-muted-foreground">Payslips for <strong>{selectedRun.label}</strong> ({payslips.length} records)</p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>{['Employee','Grade','Gross','PAYE','Pension(EE)','NHF','Total Ded.','Net Pay'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payslips.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">No payslips computed yet.</td></tr>}
                      {payslips.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2 text-foreground">{p.staff?.lastName}, {p.staff?.firstName}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.gradeLevel}</td>
                          <td className="px-3 py-2">{formatNgn(parseFloat(p.grossPay))}</td>
                          <td className="px-3 py-2 text-[--color-danger]">{formatNgn(parseFloat(p.payeeTax))}</td>
                          <td className="px-3 py-2 text-[--color-danger]">{formatNgn(parseFloat(p.pensionEmployee))}</td>
                          <td className="px-3 py-2 text-[--color-danger]">{formatNgn(parseFloat(p.nhfDeduction))}</td>
                          <td className="px-3 py-2 text-[--color-danger]">{formatNgn(parseFloat(p.totalDeductions))}</td>
                          <td className="px-3 py-2 font-semibold text-[--color-success]">{formatNgn(parseFloat(p.netPay))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a payroll run from the Runs tab to view payslips.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
