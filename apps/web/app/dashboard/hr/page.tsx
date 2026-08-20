'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/erp/confirm-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStaff, usePendingLeaves, useDecideLeave, useCreateSalaryGrade, useSalaryGrades } from '@/hooks/use-hr';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate, formatNgn } from '@/lib/utils';
import { hasEffectiveRole } from '@/lib/authz';
import type { LeaveRequestV1 } from '@uniportal/types';

const STATUS_COLORS: Record<string,string> = { ACTIVE:'badge-success', ON_LEAVE:'badge-warning', SUSPENDED:'badge-danger', RETIRED:'badge-neutral', TERMINATED:'badge-neutral' };
const LEAVE_COLORS: Record<string,string>  = { PENDING:'badge-warning', APPROVED:'badge-success', REJECTED:'badge-danger', CANCELLED:'badge-neutral' };

export default function HrPage() {
  const searchParams = useSearchParams();
  const requestedStaffId = searchParams.get('staffId');
  const user   = useAuthStore((s) => s.user);
  const canHr  = hasEffectiveRole(user, 'HR_MANAGER', 'REGISTRAR', 'SUPER_ADMIN');
  const canHod = hasEffectiveRole(user, 'HOD');

  const [tab, setTab] = useState<'staff'|'grades'|'leave'>('staff');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [pendingLeaveDecision, setPendingLeaveDecision] = useState<{ leave: LeaveRequestV1; action: 'APPROVE'|'REJECT'; note: string } | null>(null);

  const { data: staff = [], isLoading } = useStaff({ employmentStatus: statusFilter || undefined });
  const { data: grades = [] }           = useSalaryGrades();
  const { data: leaves = [] }           = usePendingLeaves();

  const { mutate: decide, isPending: deciding }       = useDecideLeave();
  const { mutate: createGrade, isPending: creating }  = useCreateSalaryGrade();

  const [gradeForm, setGradeForm] = useState({ gradeLevel: '', basicSalary: 0, housingAllowancePct: 15, transportAllowancePct: 10, medicalAllowancePct: 5 });

  const handleDecide = (leave: LeaveRequestV1, action: 'APPROVE'|'REJECT') => {
    setPendingLeaveDecision({ leave, action, note: '' });
  };

  const confirmLeaveDecision = () => {
    if (!pendingLeaveDecision) return;
    const { leave, action, note } = pendingLeaveDecision;
    setErr(''); setMsg('');
    decide({ id: leave.id, action, note: note.trim() || undefined }, {
      onSuccess: () => { setMsg(`✓ Leave ${action.toLowerCase()}d for ${leave.staff?.firstName}`); setPendingLeaveDecision(null); },
      onError:   (e) => setErr(e.message),
    });
  };

  const handleCreateGrade = () => {
    if (!gradeForm.gradeLevel || !gradeForm.basicSalary) { setErr('Grade level and basic salary required'); return; }
    setErr('');
    createGrade(gradeForm, { onSuccess: () => setMsg('✓ Salary grade created'), onError: (e) => setErr(e.message) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">Human Resources</h2>
        <div className="flex gap-2">
          {[{ key:'staff', label:'Staff' }, { key:'grades', label:'Salary Grades' }, { key:'leave', label:`Leave${leaves.length > 0 ? ` (${leaves.length})` : ''}` }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab===t.key?'bg-[--color-primary] text-white':'bg-muted text-muted-foreground hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{err}</div>}
      {msg && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}
      <ConfirmAction
        open={!!pendingLeaveDecision}
        title={`${pendingLeaveDecision?.action === 'APPROVE' ? 'Approve' : 'Reject'} leave request`}
        description={`Confirm the decision for ${pendingLeaveDecision?.leave.staff?.firstName ?? 'this staff member'}. The decision will be recorded in the leave workflow.`}
        confirmLabel={pendingLeaveDecision?.action === 'APPROVE' ? 'Approve leave' : 'Reject leave'}
        destructive={pendingLeaveDecision?.action === 'REJECT'}
        onCancel={() => setPendingLeaveDecision(null)}
        onConfirm={confirmLeaveDecision}
      >
        <label htmlFor="leave-decision-note" className="block text-sm font-medium text-foreground">Decision note {pendingLeaveDecision?.action === 'REJECT' ? '(recommended)' : '(optional)'}</label>
        <textarea id="leave-decision-note" value={pendingLeaveDecision?.note ?? ''} onChange={(e) => setPendingLeaveDecision((current) => current ? { ...current, note: e.target.value } : current)} rows={3} className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]" />
      </ConfirmAction>

      {/* ── Staff tab ───────────────────────────────────────────────────── */}
      {tab === 'staff' && (
        <div className="space-y-3">
          <select value={statusFilter} onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All Statuses</option>
            {['ACTIVE','ON_LEAVE','SUSPENDED','RETIRED','TERMINATED'].map((s) => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
          {isLoading ? <div className="animate-pulse h-40 rounded bg-muted"/> : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>{['Employee No','Name','Designation','Department','Grade','Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {staff.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No staff records yet.</td></tr>}
                  {staff.map((s) => (
                    <tr key={s.id} className={cn(requestedStaffId === s.id && 'bg-[--color-primary]/10 ring-1 ring-inset ring-[--color-primary]')}>
                      <td className="px-4 py-2.5 font-mono text-xs text-[--color-primary]">{s.employeeNo}</td>
                      <td className="px-4 py-2.5 text-foreground">{s.lastName}, {s.firstName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.designation}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.departmentName ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{s.gradeLevel ?? '—'}</td>
                      <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs',STATUS_COLORS[s.employmentStatus]??'')}>{s.employmentStatus.replace('_',' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Salary Grades tab ───────────────────────────────────────────── */}
      {tab === 'grades' && (
        <div className="space-y-4">
          {canHr && (
            <Card className="max-w-lg">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Add Salary Grade</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id:'gradeLevel', label:'Grade Level', ph:'GL-07' },
                    { id:'basicSalary', label:'Basic Salary (₦)', ph:'150000', type:'number' },
                    { id:'housingAllowancePct', label:'Housing %', ph:'15', type:'number' },
                    { id:'transportAllowancePct', label:'Transport %', ph:'10', type:'number' },
                    { id:'medicalAllowancePct', label:'Medical %', ph:'5', type:'number' },
                  ].map(({ id, label, ph, type='text' }) => (
                    <div key={id} className="space-y-1">
                      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>
                      <input id={id} type={type} placeholder={ph}
                        value={(gradeForm as Record<string,unknown>)[id] as string ?? ''}
                        onChange={(e) => setGradeForm({ ...gradeForm, [id]: type==='number' ? parseFloat(e.target.value)||0 : e.target.value })}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    </div>
                  ))}
                </div>
                <Button size="sm" onClick={handleCreateGrade} loading={creating}>Add Grade</Button>
              </CardContent>
            </Card>
          )}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>{['Grade Level','Basic Salary','Housing %','Transport %','Medical %','Annual Gross (est.)'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {grades.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No salary grades yet.</td></tr>}
                {grades.map((g) => {
                  const basic = parseFloat(g.basicSalary);
                  const gross = basic * (1 + parseFloat(g.housingAllowancePct)/100 + parseFloat(g.transportAllowancePct)/100 + parseFloat(g.medicalAllowancePct)/100);
                  return (
                    <tr key={g.id}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-[--color-primary]">{g.gradeLevel}</td>
                      <td className="px-4 py-2.5 font-medium">{formatNgn(basic)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{g.housingAllowancePct}%</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{g.transportAllowancePct}%</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{g.medicalAllowancePct}%</td>
                      <td className="px-4 py-2.5 text-foreground">{formatNgn(gross * 12)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Leave approvals tab ─────────────────────────────────────────── */}
      {tab === 'leave' && (
        <div className="space-y-3">
          {leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending leave requests.</p>
          ) : leaves.map((l) => (
            <Card key={l.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-semibold">{l.staff?.firstName} {l.staff?.lastName} <span className="text-xs text-muted-foreground">({l.staff?.employeeNo})</span></p>
                    <p className="text-xs text-muted-foreground">{l.leaveType} · {l.daysRequested} day(s) · {formatDate(l.startDate)} → {formatDate(l.endDate)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{l.reason}</p>
                  </div>
                  {(canHr || canHod) && (
                    <div className="flex gap-2">
                      <Button size="sm" loading={deciding} onClick={() => handleDecide(l, 'APPROVE')}>Approve</Button>
                      <Button size="sm" variant="destructive" loading={deciding} onClick={() => handleDecide(l, 'REJECT')}>Reject</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
