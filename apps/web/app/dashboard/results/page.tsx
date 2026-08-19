'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import {
  useStudentResults, useTranscript, useSubmitResult, useResultAction,
  useCurrentSemester, useSemesters,
} from '@/hooks/use-results';
import { cn } from '@/lib/utils';
import { effectiveRolesOf, hasEffectiveRole } from '@/lib/authz';
import type { StudentResultV1 } from '@uniportal/types';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'badge-neutral', HOD_APPROVED: 'badge-info',
  SENATE_PENDING: 'badge-warning', SENATE_PUBLISHED: 'badge-success', REJECTED: 'badge-danger',
};
const GRADE_COLORS: Record<string, string> = {
  A: 'text-green-600', B: 'text-blue-600', C: 'text-amber-600', D: 'text-orange-600',
  E: 'text-red-500', F: 'text-red-700',
};

export default function ResultsPage() {
  const user = useAuthStore((s) => s.user);
  const role = effectiveRolesOf(user)[0] ?? '';
  const isStudent = hasEffectiveRole(user, 'STUDENT');
  const isLecturer = ['STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN'].includes(role);
  const canApprove = ['HOD','DEAN','REGISTRAR','VC','SUPER_ADMIN'].includes(role);

  const [tab, setTab]         = useState<'my'|'transcript'|'entry'|'approve'>('my');
  const [selSemId, setSelSem] = useState('');
  const [actionError, setErr] = useState('');
  const [actionMsg, setMsg]   = useState('');
  const [selectedResultId, setSelectedResultId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ action: string; label: string } | null>(null);
  const [entryForm, setEntryForm] = useState({ studentId: '', courseOfferingId: '', score: '' });

  const studentId = isStudent ? (user?.studentId ?? '') : '';
  const { data: semesters = [] } = useSemesters();
  const { data: current }        = useCurrentSemester();
  const { data: myResults = [] } = useStudentResults(studentId, selSemId || undefined);
  const { data: transcript }     = useTranscript(studentId);

  const { mutate: submitResult, isPending: submitting } = useSubmitResult();
  const { mutate: applyAction,  isPending: actioning }  = useResultAction();

  const handleAction = (resultId: string, action: string, reason?: string) => {
    setErr(''); setMsg('');
    applyAction({ id: resultId, action, rejectionReason: reason }, {
      onSuccess: () => {
        setMsg(`✓ Action "${action}" applied`);
        setSelectedResultId('');
        setRejectionReason('');
        setConfirmAction(null);
      },
      onError: (e) => setErr(e.message),
    });
  };

  const cgpa = transcript?.student.cgpa ?? 0;
  const cgpaColor = cgpa >= 4.5 ? 'text-green-600' : cgpa >= 3.5 ? 'text-blue-600' : cgpa >= 2.4 ? 'text-amber-600' : 'text-red-600';

  const tabs = [
    isStudent  && { key: 'my',         label: 'My Results' },
    isStudent  && { key: 'transcript', label: 'Transcript' },
    isLecturer && { key: 'entry',      label: 'Result Entry' },
    canApprove && { key: 'approve',    label: 'Approve' },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">Results</h2>
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.key ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {actionError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{actionError}</div>}
      {actionMsg   && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{actionMsg}</div>}

      {/* Semester selector (shared) */}
      {(tab === 'my' || tab === 'entry' || tab === 'approve') && (
        <div>
          <label htmlFor="results-semester" className="sr-only">Semester</label>
          <select id="results-semester" value={selSemId} onChange={(e) => setSelSem(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All Semesters</option>
            {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {/* ── My Results (Student) ─────────────────────────────────────────── */}
      {tab === 'my' && (
        <div className="space-y-3">
          {myResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results yet for the selected period.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>{['Course','Score','Grade','GP','Credits','Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {myResults.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-[--color-primary] mr-2">{r.courseOffering?.course.code}</span>
                        <span className="text-muted-foreground text-xs">{r.courseOffering?.course.title}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium">{r.absentFromExam ? 'ABS' : parseFloat(r.score).toFixed(1)}</td>
                      <td className={cn('px-4 py-2.5 font-bold text-lg', GRADE_COLORS[r.grade] ?? '')}>{r.grade}</td>
                      <td className="px-4 py-2.5">{r.gradePoint}</td>
                      <td className="px-4 py-2.5">{r.creditUnits}</td>
                      <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_COLORS[r.status] ?? '')}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Transcript (Student) ─────────────────────────────────────────── */}
      {tab === 'transcript' && transcript && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-6 flex-wrap">
                <div className="flex-1 min-w-[200px] space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Name:</span> <strong>{transcript.student.fullName}</strong></p>
                  <p><span className="text-muted-foreground">Matric:</span> <span className="font-mono text-[--color-primary]">{transcript.student.matricNo}</span></p>
                  <p><span className="text-muted-foreground">Programme:</span> {transcript.student.programme}</p>
                  <p><span className="text-muted-foreground">Faculty:</span> {transcript.student.faculty}</p>
                  <p><span className="text-muted-foreground">Entry Year:</span> {transcript.student.entryYear}</p>
                </div>
                <div className="text-center">
                  <p className={cn('text-5xl font-bold', cgpaColor)}>{cgpa.toFixed(2)}</p>
                  <p className="text-sm font-medium text-muted-foreground mt-1">Cumulative GPA</p>
                  <p className="text-xs text-muted-foreground mt-1">{transcript.student.degreeClass}</p>
                  <p className="text-xs text-muted-foreground">{transcript.student.totalCreditUnitsEarned} credit units earned</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {transcript.semesters.map((sem) => {
            const semCU = sem.results.reduce((s, r) => s + r.creditUnits, 0);
            const semGP = sem.results.reduce((s, r) => s + parseFloat(r.gradePoint) * r.creditUnits, 0);
            const semGPA = semCU > 0 ? (semGP / semCU).toFixed(2) : '0.00';
            return (
              <Card key={sem.semesterName}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{sem.semesterName}</CardTitle>
                    <span className="text-sm font-semibold text-muted-foreground">GPA: {semGPA}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>{['Code','Course','Score','Grade','GP','CU'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-xs text-muted-foreground uppercase">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sem.results.map((r) => (
                          <tr key={r.id}>
                            <td className="px-3 py-2 font-mono text-xs text-[--color-primary]">{r.courseOffering?.course.code}</td>
                            <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[160px]">{r.courseOffering?.course.title}</td>
                            <td className="px-3 py-2">{r.absentFromExam ? 'ABS' : parseFloat(r.score).toFixed(1)}</td>
                            <td className={cn('px-3 py-2 font-bold', GRADE_COLORS[r.grade] ?? '')}>{r.grade}</td>
                            <td className="px-3 py-2">{r.gradePoint}</td>
                            <td className="px-3 py-2">{r.creditUnits}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Result Entry (Lecturer) ─────────────────────────────────────── */}
      {tab === 'entry' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Submit Result</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Enter scores individually via the form below, or use the API for bulk submission.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-2xl">
              {[
                { id: 'studentId',       label: 'Student ID (UUID)', ph: 'xxxxxxxx-xxxx-...' },
                { id: 'courseOfferingId',label: 'Course Offering ID', ph: 'xxxxxxxx-xxxx-...' },
                { id: 'score',           label: 'Score (0–100)',       ph: '75.5', type: 'number' },
              ].map(({ id, label, ph, type = 'text' }) => (
                <div key={id} className="space-y-1">
                  <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>
                  <input id={id} type={type} placeholder={ph}
                    value={entryForm[id as keyof typeof entryForm]}
                    onChange={(e) => setEntryForm((current) => ({ ...current, [id]: e.target.value }))}
                    aria-describedby={`${id}-hint`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring" />
                  {id !== 'score' && <p id={`${id}-hint`} className="text-xs text-muted-foreground">Use the record identifier from the authorised course-registration workflow.</p>}
                </div>
              ))}
              <div className="sm:col-span-2 lg:col-span-3">
                <Button size="sm" loading={submitting}
                  onClick={() => {
                    const studentId = entryForm.studentId.trim();
                    const courseOfferingId = entryForm.courseOfferingId.trim();
                    const score = Number(entryForm.score);
                    if (!studentId || !courseOfferingId || !Number.isFinite(score)) { setErr('Provide the student, course offering, and a valid score.'); return; }
                    if (score < 0 || score > 100) { setErr('Score must be between 0 and 100.'); return; }
                    if (!selSemId) { setErr('Select a semester first'); return; }
                    setErr('');
                    submitResult({ studentId, courseOfferingId, semesterId: selSemId, score }, {
                      onSuccess: () => { setMsg('✓ Result submitted as DRAFT'); setEntryForm({ studentId: '', courseOfferingId: '', score: '' }); },
                      onError:   (e) => setErr(e.message),
                    });
                  }}>
                  Submit Result
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Approval (HOD / Registrar) ─────────────────────────────────── */}
      {tab === 'approve' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Review result action</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Select the result record first. The action is not submitted until you review and confirm it.</p>
              <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
                <div className="space-y-1">
                  <label htmlFor="approval-result-id" className="text-xs font-medium text-muted-foreground">Result ID</label>
                  <input id="approval-result-id" value={selectedResultId} onChange={(e) => setSelectedResultId(e.target.value.trim())}
                    placeholder="Paste the result UUID" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring" />
                  <p className="text-xs text-muted-foreground">Use a searchable result queue in the next iteration; raw identifiers are retained here only for API compatibility.</p>
                </div>
                <div className="space-y-1">
                  <label htmlFor="rejection-reason" className="text-xs font-medium text-muted-foreground">Rejection reason (required only for rejection)</label>
                  <textarea id="rejection-reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3}
                    placeholder="Explain what must be corrected" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { action: 'HOD_APPROVE', label: 'HOD Approve', variant: 'default' },
                  { action: 'SUBMIT_SENATE', label: 'Submit to Senate', variant: 'default' },
                  { action: 'SENATE_PUBLISH', label: 'Senate Publish', variant: 'default' },
                  { action: 'REJECT', label: 'Reject', variant: 'destructive' },
                ].map(({ action, label, variant }) => (
                  <Button key={action} size="sm" variant={variant as 'default' | 'destructive'} loading={actioning}
                    disabled={!selectedResultId || (action === 'REJECT' && rejectionReason.trim().length < 10)}
                    onClick={() => setConfirmAction({ action, label })}>{label}</Button>
                ))}
              </div>
            </CardContent>
          </Card>
          {confirmAction && (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm"><strong>Confirm {confirmAction.label}</strong> for result <code>{selectedResultId}</code>. This may change the official academic record.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
                  <Button size="sm" variant={confirmAction.action === 'REJECT' ? 'destructive' : 'default'} loading={actioning}
                    onClick={() => handleAction(selectedResultId, confirmAction.action, confirmAction.action === 'REJECT' ? rejectionReason.trim() : undefined)}>Confirm {confirmAction.label}</Button>
                </div>
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted-foreground"><strong>Publication control:</strong> Senate publication updates Student.cgpa atomically in the same database transaction.</p>
        </div>
      )}
    </div>
  );
}
