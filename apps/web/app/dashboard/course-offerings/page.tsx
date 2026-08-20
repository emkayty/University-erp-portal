'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ConfirmAction } from '@/components/erp/confirm-action';
import {
  useCalendars,
} from '@/hooks/use-calendar';
import {
  useCourseOfferings,
  useCourses,
  useCreateCourseOffering,
  useTransitionCourseOffering,
} from '@/hooks/use-curriculum';
import { useStaff } from '@/hooks/use-hr';
import { hasEffectiveRole } from '@/lib/authz';
import { useAuthStore } from '@/stores/auth.store';

const SEMESTERS = ['FIRST', 'SECOND', 'SUMMER'] as const;
const NEXT_STATES: Record<string, string[]> = {
  PLANNED: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'CANCELLED'],
  REGISTRATION_CLOSED: ['TEACHING', 'CANCELLED'],
  TEACHING: ['ASSESSMENT', 'CANCELLED'],
  ASSESSMENT: ['EXAMINATION', 'GRADING'],
  EXAMINATION: ['GRADING'],
  GRADING: ['RESULTS_PENDING'],
  RESULTS_PENDING: ['RESULTS_PUBLISHED'],
  RESULTS_PUBLISHED: ['COMPLETED'],
};

const pretty = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CourseOfferingsPage() {
  const user = useAuthStore((state) => state.user);
  const canView = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD', 'STAFF');
  const canCreate = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR');
  const canTransition = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD');

  const [calendarFilter, setCalendarFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [form, setForm] = useState({ courseId: '', academicCalendarId: '', semester: 'FIRST' as typeof SEMESTERS[number], lecturerId: '', sectionCode: 'A', maxStudents: '' });
  const [actionError, setActionError] = useState('');
  const [pendingCancel, setPendingCancel] = useState<{ id: string; label: string } | null>(null);

  const { data: calendars = [] } = useCalendars();
  const { data: courses = [] } = useCourses();
  const { data: staff = [] } = useStaff({ employmentStatus: 'ACTIVE', page: 1 });
  const { data: offerings = [], isLoading } = useCourseOfferings({ calendarId: calendarFilter || undefined, semester: semesterFilter || undefined });
  const createOffering = useCreateCourseOffering();
  const transitionOffering = useTransitionCourseOffering();

  const activeCalendars = useMemo(() => calendars.filter((calendar) => calendar.status !== 'COMPLETED'), [calendars]);
  const selectedCalendar = activeCalendars.find((calendar) => calendar.id === form.academicCalendarId);

  const create = () => {
    if (!form.courseId || !form.academicCalendarId) { setActionError('Select a course and academic calendar.'); return; }
    const maxStudents = form.maxStudents ? Number(form.maxStudents) : undefined;
    if (maxStudents !== undefined && (!Number.isInteger(maxStudents) || maxStudents < 1)) { setActionError('Maximum students must be a whole number of at least 1.'); return; }
    setActionError('');
    createOffering.mutate({
      courseId: form.courseId,
      academicCalendarId: form.academicCalendarId,
      semester: form.semester,
      lecturerId: form.lecturerId || undefined,
      sectionCode: form.sectionCode.trim().toUpperCase() || 'A',
      maxStudents,
    }, {
      onSuccess: () => setForm((current) => ({ ...current, courseId: '', lecturerId: '', sectionCode: 'A', maxStudents: '' })),
      onError: (error) => setActionError(error.message),
    });
  };

  const transition = (id: string, status: string) => {
    setActionError('');
    transitionOffering.mutate({ id, status }, { onError: (error) => setActionError(error.message) });
  };

  if (!canView) {
    return <Card><CardContent className="py-12 text-center"><p className="font-semibold">Course offering access restricted</p><p className="mt-2 text-sm text-muted-foreground">Course offerings are available only to authorised academic users.</p></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="enterprise-eyebrow">Academic operations</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Course Offerings</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Create the semester teaching instance of a course, assign an active lecturer, and move the offering through its controlled academic lifecycle.</p>
      </header>

      {actionError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">{actionError}</p>}

      {canCreate && <Card className="enterprise-surface">
        <CardHeader><CardTitle>Create course offering</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-medium text-muted-foreground">Course<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={form.courseId} onChange={(event) => setForm((current) => ({ ...current, courseId: event.target.value }))}><option value="">Select course</option>{courses.filter((course) => course.isActive).map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
            <label className="text-xs font-medium text-muted-foreground">Academic calendar<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={form.academicCalendarId} onChange={(event) => setForm((current) => ({ ...current, academicCalendarId: event.target.value }))}><option value="">Select calendar</option>{activeCalendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.academicYear} · {pretty(calendar.status)}</option>)}</select></label>
            <label className="text-xs font-medium text-muted-foreground">Semester<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={form.semester} onChange={(event) => setForm((current) => ({ ...current, semester: event.target.value as typeof SEMESTERS[number] }))}>{SEMESTERS.map((semester) => <option key={semester} value={semester}>{pretty(semester)}</option>)}</select></label>
            <label className="text-xs font-medium text-muted-foreground">Active lecturer<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={form.lecturerId} onChange={(event) => setForm((current) => ({ ...current, lecturerId: event.target.value }))}><option value="">Unassigned for now</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.employeeNo} · {member.firstName} {member.lastName} · {member.designation}</option>)}</select></label>
            <label className="text-xs font-medium text-muted-foreground">Section code<Input className="mt-1" maxLength={10} value={form.sectionCode} onChange={(event) => setForm((current) => ({ ...current, sectionCode: event.target.value }))} /></label>
            <label className="text-xs font-medium text-muted-foreground">Maximum students<Input className="mt-1" type="number" min={1} step={1} value={form.maxStudents} onChange={(event) => setForm((current) => ({ ...current, maxStudents: event.target.value }))} placeholder="Optional" /></label>
          </div>
          {selectedCalendar && <p className="text-xs text-muted-foreground">Selected academic year: <span className="font-medium text-foreground">{selectedCalendar.academicYear}</span>. The API will verify that the semester has been configured.</p>}
          <Button onClick={create} loading={createOffering.isPending}>Create offering</Button>
        </CardContent>
      </Card>}

      <Card className="enterprise-surface">
        <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Offerings</CardTitle><p className="mt-1 text-sm text-muted-foreground">{offerings.length} offering(s) in the selected view.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Filter by academic calendar" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={calendarFilter} onChange={(event) => setCalendarFilter(event.target.value)}><option value="">All calendars</option>{calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.academicYear}</option>)}</select><select aria-label="Filter by semester" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}><option value="">All semesters</option>{SEMESTERS.map((semester) => <option key={semester} value={semester}>{pretty(semester)}</option>)}</select></div></div></CardHeader>
        <CardContent>{isLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : offerings.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No course offerings found for this view.</p> : <div className="grid gap-3 lg:grid-cols-2">{offerings.map((offering) => { const nextStates = NEXT_STATES[offering.lifecycleStatus] ?? []; return <article key={offering.id} className="rounded-xl border border-border bg-background/70 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{offering.course.code} · {offering.course.title}</p><p className="mt-1 text-xs text-muted-foreground">{offering.academicYear} · {pretty(offering.semester)} · Section {offering.sectionCode}</p><p className="mt-1 text-xs text-muted-foreground">Lecturer: {offering.lecturer ? `${offering.lecturer.employeeNo} · ${offering.lecturer.firstName} ${offering.lecturer.lastName}` : 'Unassigned'}</p>{offering.maxStudents && <p className="mt-1 text-xs text-muted-foreground">Capacity: {offering.maxStudents}</p>}</div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${offering.lifecycleStatus === 'CANCELLED' ? 'badge-danger' : offering.lifecycleStatus === 'COMPLETED' ? 'badge-success' : 'badge-info'}`}>{pretty(offering.lifecycleStatus)}</span></div>{canTransition && nextStates.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{nextStates.map((status) => status === 'CANCELLED' ? <Button key={status} size="sm" variant="destructive" onClick={() => setPendingCancel({ id: offering.id, label: `${offering.course.code} Section ${offering.sectionCode}` })}>Cancel offering</Button> : <Button key={status} size="sm" variant="outline" loading={transitionOffering.isPending} onClick={() => transition(offering.id, status)}>Move to {pretty(status)}</Button>)}</div>}</article>; })}</div>}</CardContent>
      </Card>

      <ConfirmAction open={Boolean(pendingCancel)} title="Cancel course offering?" description={`This will stop the academic lifecycle for ${pendingCancel?.label ?? 'this offering'}. The record will remain auditable and cannot be reopened through the current lifecycle rules.`} confirmLabel="Cancel offering" destructive onCancel={() => setPendingCancel(null)} onConfirm={() => { if (pendingCancel) transition(pendingCancel.id, 'CANCELLED'); setPendingCancel(null); }} />
    </div>
  );
}
