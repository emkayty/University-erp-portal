'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';
import { effectiveRolesOf, hasEffectiveRole } from '@/lib/authz';
import { useClearanceAction, useStudentClearance } from '@/hooks/use-clearance';
import { StudentPicker } from '@/components/erp/student-picker';

export default function ClearancePage() {
  const user = useAuthStore((s) => s.user);
  const role = effectiveRolesOf(user)[0] ?? '';
  const params = useSearchParams();
  const isStudent = hasEffectiveRole(user, 'STUDENT');
  const [studentId, setStudentId] = useState(isStudent ? user?.studentId ?? '' : params.get('studentId') ?? '');
  const [reason, setReason] = useState('');
  const { data: clearance, isLoading, isError } = useStudentClearance(studentId);
  const action = useClearanceAction();
  const items = clearance?.checklist.map(({ item, clearance: record }) => ({
    id: item.id,
    name: item.name,
    status: record.status,
    description: item.description,
    responsibleRole: item.responsibleRole,
    blockReason: record.blockReason,
    waiverReason: record.waiverReason,
  })) ?? [];
  const canClear = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD', 'BURSAR', 'STAFF', 'SUPPORT_STAFF');
  const canWaive = hasEffectiveRole(user, 'SUPER_ADMIN', 'VC');

  return <div className="erp-workspace-page">
    <header className="erp-workspace-header">
      <p className="enterprise-eyebrow">Graduation and operational readiness</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Clearance Workspace</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Track each clearance obligation and record decisions with an explicit reason.</p>
    </header>
    {!isStudent && <Card className="erp-control-rail"><CardContent className="pt-5"><StudentPicker value={studentId} onChange={(id) => setStudentId(id)} selectedLabel={params.get('studentId') ? 'Student selected from approved context' : undefined} filters={{ status: 'ACTIVE' }} required /></CardContent></Card>}
    {isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Unable to load clearance. Confirm that the selected student is within your access scope.</div>}
    {studentId && <Card className="erp-data-surface"><CardHeader><CardTitle>Clearance checklist</CardTitle><p className="text-sm text-muted-foreground">{clearance?.administrativelyCleared ? 'All required administrative clearances are complete.' : 'Administrative clearance is still outstanding.'} This is not, by itself, a graduation decision.</p></CardHeader><CardContent className="space-y-3"><div className="flex flex-col gap-3 sm:flex-row"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for block or waiver (minimum 5 characters)" className="max-w-xl" /><span className="self-center text-xs text-muted-foreground">{items.filter((i) => i.status === 'CLEARED' || i.status === 'WAIVED').length}/{items.length} completed</span></div>{isLoading ? <p className="text-sm text-muted-foreground">Loading checklist…</p> : items.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No clearance records found.</p> : items.map((item) => <article key={item.id} className="erp-clearance-item flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-medium">{item.name}</h2><p className="text-sm text-muted-foreground">{item.description || 'No additional description.'} · Responsible: {item.responsibleRole || 'Institution'}</p>{item.blockReason && <p className="mt-1 text-xs text-red-700">Block reason: {item.blockReason}</p>}</div><div className="flex flex-wrap items-center gap-2"><span className="erp-status-pill rounded-full bg-muted px-2 py-1 text-xs">{item.status}</span>{canClear && item.status !== 'CLEARED' && item.status !== 'WAIVED' && <Button size="sm" onClick={() => action.mutate({ studentId, itemId: item.id, action: 'clear' })} loading={action.isPending}>Clear</Button>}{canClear && item.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => action.mutate({ studentId, itemId: item.id, action: 'block', reason })} disabled={reason.trim().length < 5}>Block</Button>}{canWaive && item.status === 'BLOCKED' && <Button size="sm" variant="outline" onClick={() => action.mutate({ studentId, itemId: item.id, action: 'waive', reason })} disabled={reason.trim().length < 5}>Waive</Button>}</div></article>)}</CardContent></Card>}
  </div>;
}
