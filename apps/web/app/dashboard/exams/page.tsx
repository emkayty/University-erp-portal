'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/erp/confirm-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { effectiveRolesOf } from '@/lib/authz';

type TimetableEntry = {
  id: string;
  semesterId?: string;
  courseOfferingId?: string;
  venueId?: string | null;
  examDate: string;
  startTime: string;
  durationMinutes: number;
  venue: string;
  courseOffering?: { id?: string; course?: { code: string; title: string } };
};

type ExamReport = {
  candidates: { total: number; eligible: number };
  attendance: { total: number; missing: number; present?: number; attendancePct?: number; byStatus: Record<string, number> };
};

type TimetableForm = {
  courseOfferingId: string;
  venueId: string;
  examDate: string;
  startTime: string;
  durationMinutes: string;
  invigilatorNotes: string;
};

const emptyForm: TimetableForm = { courseOfferingId: '', venueId: '', examDate: '', startTime: '09:00', durationMinutes: '120', invigilatorNotes: '' };

export default function ExamsPage() {
  const role = useAuthStore((s) => effectiveRolesOf(s.user)[0]);
  const [semesterId, setSemesterId] = useState('');
  const [activeSemester, setActiveSemester] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [editingExam, setEditingExam] = useState<string | null>(null);
  const [pendingCancelExam, setPendingCancelExam] = useState<TimetableEntry | null>(null);
  const [form, setForm] = useState<TimetableForm>(emptyForm);
  const qc = useQueryClient();
  const timetable = useQuery({ queryKey: ['exams', 'timetable', activeSemester], queryFn: () => apiClient.get<TimetableEntry[]>(`/exams/timetable/${activeSemester}`), enabled: Boolean(activeSemester) });
  const report = useQuery({ queryKey: ['exams', 'report', selectedExam], queryFn: () => apiClient.get<ExamReport>(`/exams/timetable/${selectedExam}/report`), enabled: Boolean(selectedExam) });
  const candidates = useQuery({ queryKey: ['exams', 'candidates', selectedExam], queryFn: () => apiClient.get<Array<{ studentId: string; eligibility: string; reason?: string }>>(`/exams/timetable/${selectedExam}/candidates`), enabled: Boolean(selectedExam) });
  const generate = useMutation({ mutationFn: (id: string) => apiClient.post(`/exams/timetable/${id}/generate-candidates`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['exams', 'candidates', selectedExam] }); void qc.invalidateQueries({ queryKey: ['exams', 'report', selectedExam] }); } });
  const attendance = useMutation({ mutationFn: ({ studentId, status }: { studentId: string; status: string }) => apiClient.post(`/exams/timetable/${selectedExam}/attendance/${studentId}`, { status }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['exams', 'candidates', selectedExam] }); void qc.invalidateQueries({ queryKey: ['exams', 'report', selectedExam] }); } });
  const saveTimetable = useMutation({
    mutationFn: async () => {
      const payload = { ...form, durationMinutes: Number(form.durationMinutes), ...(editingExam ? {} : { semesterId: activeSemester }) };
      return editingExam ? apiClient.patch(`/exams/timetable/${editingExam}`, payload) : apiClient.post('/exams/timetable', payload);
    },
    onSuccess: () => { setEditingExam(null); setForm(emptyForm); void qc.invalidateQueries({ queryKey: ['exams', 'timetable', activeSemester] }); },
  });
  const cancelTimetable = useMutation({ mutationFn: (id: string) => apiClient.delete(`/exams/timetable/${id}`), onSuccess: () => { setSelectedExam(''); void qc.invalidateQueries({ queryKey: ['exams', 'timetable', activeSemester] }); } });
  const operator = ['SUPER_ADMIN', 'VC', 'REGISTRAR', 'DEAN', 'HOD', 'STAFF'].includes(role ?? '');
  const author = ['SUPER_ADMIN', 'REGISTRAR', 'HOD'].includes(role ?? '');

  const beginEdit = (exam: TimetableEntry) => {
    setEditingExam(exam.id);
    setForm({
      courseOfferingId: exam.courseOfferingId ?? exam.courseOffering?.id ?? '',
      venueId: exam.venueId ?? '',
      examDate: new Date(exam.examDate).toISOString().slice(0, 10),
      startTime: exam.startTime,
      durationMinutes: String(exam.durationMinutes),
      invigilatorNotes: '',
    });
  };

  const submitForm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.courseOfferingId.trim() || !form.venueId.trim() || !form.examDate || !form.startTime) return;
    saveTimetable.mutate();
  };

  const cancelExam = (exam: TimetableEntry) => setPendingCancelExam(exam);

  return <div className="erp-workspace-page space-y-6">
    <header className="erp-page-header"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[--color-primary]">Examination operations</p><h1 className="text-2xl font-semibold">Exams Workspace</h1><p className="mt-1 text-sm text-muted-foreground">Author and safely reschedule official examinations, generate eligible candidates, and monitor attendance coverage before results processing.</p></header>
    <Card className="erp-control-rail"><CardContent className="pt-5"><form onSubmit={(e) => { e.preventDefault(); setActiveSemester(semesterId.trim()); setSelectedExam(''); setEditingExam(null); }} className="flex flex-col gap-3 sm:flex-row"><Input value={semesterId} onChange={(e) => setSemesterId(e.target.value)} placeholder="Semester UUID" required /><Button type="submit">Load timetable</Button></form></CardContent></Card>
    {activeSemester && author && <Card><CardHeader><CardTitle>{editingExam ? 'Reschedule examination' : 'Author timetable entry'}</CardTitle></CardHeader><CardContent><form onSubmit={submitForm} className="grid gap-3 md:grid-cols-2"><Input value={form.courseOfferingId} onChange={(e) => setForm({ ...form, courseOfferingId: e.target.value })} placeholder="Course offering UUID" required /><Input value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })} placeholder="Exam venue UUID" required /><Input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} required /><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /><Input type="number" min={30} max={360} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} placeholder="Duration in minutes" required /><Input value={form.invigilatorNotes} onChange={(e) => setForm({ ...form, invigilatorNotes: e.target.value })} placeholder="Invigilator notes (optional)" /><div className="flex gap-2 md:col-span-2"><Button type="submit" loading={saveTimetable.isPending}>{editingExam ? 'Save reschedule' : 'Create timetable entry'}</Button>{editingExam && <Button type="button" variant="outline" onClick={() => { setEditingExam(null); setForm(emptyForm); }}>Cancel edit</Button>}</div></form></CardContent></Card>}
    {timetable.isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Unable to load the timetable for this semester.</div>}
    {activeSemester && <Card className="erp-data-surface"><CardHeader><CardTitle>Official timetable</CardTitle></CardHeader><CardContent className="space-y-3">{timetable.isLoading ? <p className="text-sm text-muted-foreground">Loading timetable…</p> : timetable.data?.length ? timetable.data.map((exam) => <article key={exam.id} className={`rounded-lg border p-4 ${selectedExam === exam.id ? 'border-[--color-primary]' : ''}`}><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="font-medium">{exam.courseOffering?.course?.code ?? 'Course'} · {exam.courseOffering?.course?.title ?? 'Examination'}</h2><p className="text-sm text-muted-foreground">{new Date(exam.examDate).toLocaleDateString()} · {exam.startTime} · {exam.durationMinutes} minutes · {exam.venue}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedExam(exam.id)}>View report</Button>{operator && <Button size="sm" onClick={() => generate.mutate(exam.id)} loading={generate.isPending}>Generate candidates</Button>}{author && <><Button size="sm" variant="outline" onClick={() => beginEdit(exam)}>Reschedule</Button><Button size="sm" variant="destructive" onClick={() => cancelExam(exam)} loading={cancelTimetable.isPending}>Cancel exam</Button></>}</div></div></article>) : <p className="py-6 text-sm text-muted-foreground">No timetable entries found.</p>}</CardContent></Card>}
    {selectedExam && <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>Attendance report</CardTitle></CardHeader><CardContent>{report.isLoading ? <p className="text-sm text-muted-foreground">Loading report…</p> : report.data ? <div className="grid grid-cols-2 gap-3 text-sm"><Metric label="Candidates" value={report.data.candidates.total} /><Metric label="Eligible" value={report.data.candidates.eligible} /><Metric label="Attendance records" value={report.data.attendance.total} /><Metric label="Present" value={report.data.attendance.present ?? 0} /><Metric label="Coverage" value={report.data.attendance.attendancePct ?? 0} /><Metric label="Missing" value={report.data.attendance.missing} /></div> : <p className="text-sm text-muted-foreground">No report available.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Candidate list</CardTitle></CardHeader><CardContent className="space-y-2">{candidates.isLoading ? <p className="text-sm text-muted-foreground">Loading candidates…</p> : candidates.data?.length ? candidates.data.map((candidate) => <div key={candidate.studentId} className="flex flex-col gap-2 rounded border p-2 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-mono text-xs">{candidate.studentId}</span><span>{candidate.eligibility}</span>{operator && candidate.eligibility === 'ELIGIBLE' && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => attendance.mutate({ studentId: candidate.studentId, status: 'PRESENT' })} loading={attendance.isPending}>Present</Button><Button size="sm" variant="outline" onClick={() => attendance.mutate({ studentId: candidate.studentId, status: 'ABSENT' })} loading={attendance.isPending}>Absent</Button></div>}</div>) : <p className="text-sm text-muted-foreground">Candidates have not been generated.</p>}</CardContent></Card></div>}
    <ConfirmAction open={Boolean(pendingCancelExam)} title="Cancel examination?" description="Cancellation is only allowed before candidates or attendance exist. The action will be recorded in the audit log." confirmLabel="Cancel examination" destructive onCancel={() => setPendingCancelExam(null)} onConfirm={() => { if (pendingCancelExam) cancelTimetable.mutate(pendingCancelExam.id); setPendingCancelExam(null); }} />
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>; }
