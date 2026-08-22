'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';
import { effectiveRolesOf, hasEffectiveRole } from '@/lib/authz';
import { useClearanceAction, useStudentClearance } from '@/hooks/use-clearance';

export default function ClearancePage() {
  const user = useAuthStore((s) => s.user);
  const role = effectiveRolesOf(user)[0] ?? '';
  const params = useSearchParams();
  const isStudent = hasEffectiveRole(user, 'STUDENT');
  const [inputId, setInputId] = useState(params.get('studentId') ?? (isStudent ? user?.studentId ?? '' : ''));
  const [studentId, setStudentId] = useState(isStudent ? user?.studentId ?? '' : params.get('studentId') ?? '');
  const [reason, setReason] = useState('');
  const { data: items = [], isLoading, isError } = useStudentClearance(studentId);
  const action = useClearanceAction();
  const canClear = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD', 'BURSAR', 'STAFF', 'SUPPORT_STAFF');
  const canWaive = hasEffectiveRole(user, 'SUPER_ADMIN', 'VC');

  return <div className="erp-workspace-page">
    <header><p className="text-sm text-muted-foreground">Graduation and operational readiness</p><h1 className="text-2xl font-semibold">Clearance Workspace</h1><p className="mt-1 text-sm text-muted-foreground">Track each clearance obligation and record decisions with an explicit reason.</p></header>
    {!isStudent && <Card><CardContent className="pt-5"><form onSubmit={(e) => { e.preventDefault(); setStudentId(inputId.trim()); }} className="flex flex-col gap-3 sm:flex-row"><Input value={inputId} onChange={(e) => setInputId(e.target.value)} placeholder="Student UUID" required /><Button type="submit">Load clearance</Button></form></CardContent></Card>}
    {isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Unable to load clearance. Confirm the student identifier and your access scope.</div>}
    {studentId && <Card><CardHeader><CardTitle>Clearance checklist</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-col gap-3 sm:flex-row"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for block or waiver (minimum 5 characters)" className="max-w-xl" /><span className="self-center text-xs text-muted-foreground">{items.filter((i) => i.status === 'CLEARED' || i.status === 'WAIVED').length}/{items.length} completed</span></div>{isLoading ? <p className="text-sm text-muted-foreground">Loading checklist…</p> : items.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No clearance records found.</p> : items.map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-medium">{item.name}</h2><p className="text-sm text-muted-foreground">{item.description || 'No additional description.'} · Responsible: {item.responsibleRole || 'Institution'}</p>{item.blockReason && <p className="mt-1 text-xs text-red-700">Block reason: {item.blockReason}</p>}</div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-muted px-2 py-1 text-xs">{item.status}</span>{canClear && item.status !== 'CLEARED' && item.status !== 'WAIVED' && <Button size="sm" onClick={() => action.mutate({ studentId, itemId: item.id, action: 'clear' })} loading={action.isPending}>Clear</Button>}{canClear && item.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => action.mutate({ studentId, itemId: item.id, action: 'block', reason })} disabled={reason.trim().length < 5}>Block</Button>}{canWaive && item.status === 'BLOCKED' && <Button size="sm" variant="outline" onClick={() => action.mutate({ studentId, itemId: item.id, action: 'waive', reason })} disabled={reason.trim().length < 5}>Waive</Button>}</div></article>)}</CardContent></Card>}
  </div>;
}
