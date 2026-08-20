'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button }  from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import {
  useFaculties, useDepartments, useProgrammes, useProgramme,
  useCourses, useCcmasCompliance,
  useCreateFaculty, useUpdateFaculty, useCreateDepartment, useUpdateDepartment,
  useCreateProgramme, useUpdateProgramme, useCreateCourse, useUpdateCourse,
  useAddProgrammeCourse, useRemoveProgrammeCourse,
} from '@/hooks/use-curriculum';
import { useAuthStore } from '@/stores/auth.store';
import { hasEffectiveRole } from '@/lib/authz';
import { cn } from '@/lib/utils';
import { ConfirmAction } from '@/components/erp/confirm-action';
import type { CourseV1, FacultyV1, DepartmentV1, ProgrammeV1 } from '@uniportal/types';

type Panel = 'faculties' | 'departments' | 'programmes' | 'courses' | 'ccmas';

const DEGREE_TYPES = ['BSC','BA','BENG','BTECH','HND','ND','MASTERS','PHD','DIPLOMA','PGDIP','OTHER'];
const CCMAS_CATS   = ['CORE','ELECTIVE','GENERAL_STUDIES'];
const SEMESTERS    = ['FIRST','SECOND','SUMMER'];

// ─── Schemas ─────────────────────────────────────────────────────────────────
const facultySchema    = z.object({ name: z.string().min(2), code: z.string().min(2).max(10), isActive: z.boolean().optional() });
const deptSchema       = z.object({ name: z.string().min(2), code: z.string().min(2).max(10), facultyId: z.string().uuid(), isActive: z.boolean().optional() });
const programmeSchema  = z.object({
  name: z.string().min(2), code: z.string().min(2).max(20),
  departmentId: z.string().uuid(), degreeType: z.string().min(1),
  durationYears: z.coerce.number().min(1).max(7),
  minCreditUnits: z.coerce.number().min(60).optional(),
  maxCreditUnits: z.coerce.number().min(90).optional(),
  isActive: z.boolean().optional(),
});
const courseSchema = z.object({
  code: z.string().min(2).max(20), title: z.string().min(2),
  creditUnits: z.coerce.number().min(1).max(12),   departmentId: z.string().uuid(),   ccmasCategory: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});
const mappingSchema = z.object({
  courseId: z.string().uuid(), level: z.coerce.number().min(100).max(800),
  semester: z.string().min(1), isCompulsory: z.boolean(), ccmasCategory: z.string().optional(),
});

type FacultyForm   = z.infer<typeof facultySchema>;
type DeptForm      = z.infer<typeof deptSchema>;
type ProgrammeForm = z.infer<typeof programmeSchema>;
type CourseForm    = z.infer<typeof courseSchema>;
type MappingForm   = z.infer<typeof mappingSchema>;
type RemoveMapping = { courseId: string; courseCode: string; level: number; semester: string };
type EditingEntity =
  | { type: 'faculty'; id: string }
  | { type: 'department'; id: string }
  | { type: 'programme'; id: string }
  | { type: 'course'; id: string };

export default function CurriculumPage() {
  const searchParams = useSearchParams();
  const requestedPanel = searchParams.get('panel');
  const requestedCourseId = searchParams.get('courseId');
  const user      = useAuthStore((s) => s.user);
  const canCreateInstitutional = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR');
  const canCreateCourse = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD');
  const canUpdateFaculty = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR');
  const canUpdateDepartment = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'DEAN');
  const canUpdateProgramme = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'DEAN');
  const canUpdateCourse = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD');
  const canManageMappings = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD');

  const [panel,         setPanel]         = useState<Panel>(requestedPanel === 'courses' ? 'courses' : 'faculties');
  const [selectedFacId, setSelectedFacId] = useState<string | null>(null);
  const [selectedDeptId,setSelectedDeptId]= useState<string | null>(null);
  const [selectedProgId,setSelectedProgId]= useState<string | null>(null);
  const [showForm,      setShowForm]      = useState(false);
  const [showMappingForm,setShowMappingForm] = useState(false);
  const [removeMapping, setRemoveMapping] = useState<RemoveMapping | null>(null);
  const [editing,       setEditing]       = useState<EditingEntity | null>(null);
  const [formError,     setFormError]     = useState('');

  useEffect(() => {
    if (requestedPanel === 'courses') setPanel('courses');
  }, [requestedPanel]);

  const { data: faculties   = [] } = useFaculties();
  const { data: departments = [] } = useDepartments(selectedFacId ?? undefined);
  const { data: programmes  = [] } = useProgrammes(selectedDeptId ?? undefined);
  const { data: courses     = [] } = useCourses(selectedDeptId ?? undefined);
  const { data: programme  }       = useProgramme(selectedProgId ?? '');
  const { data: ccmas       = [] } = useCcmasCompliance();

  const { mutate: createFaculty,  isPending: fCreating } = useCreateFaculty();
  const { mutate: updateFaculty,  isPending: fUpdating } = useUpdateFaculty();
  const { mutate: createDept,     isPending: dCreating } = useCreateDepartment();
  const { mutate: updateDept,     isPending: dUpdating } = useUpdateDepartment();
  const { mutate: createProg,     isPending: pCreating } = useCreateProgramme();
  const { mutate: updateProg,     isPending: pUpdating } = useUpdateProgramme();
  const { mutate: createCourse,   isPending: cCreating } = useCreateCourse();
  const { mutate: updateCourse,   isPending: cUpdating } = useUpdateCourse();
  const { mutate: addProgrammeCourse, isPending: mappingAdding } = useAddProgrammeCourse();
  const { mutate: removeProgrammeCourse, isPending: mappingRemoving } = useRemoveProgrammeCourse();

  const fForm = useForm<FacultyForm>  ({ resolver: zodResolver(facultySchema) });
  const dForm = useForm<DeptForm>     ({ resolver: zodResolver(deptSchema) });
  const pForm = useForm<ProgrammeForm>({ resolver: zodResolver(programmeSchema) });
  const cForm = useForm<CourseForm>   ({ resolver: zodResolver(courseSchema) });
  const mappingForm = useForm<MappingForm>({
    resolver: zodResolver(mappingSchema),
    defaultValues: { level: 100, semester: 'FIRST', isCompulsory: true, ccmasCategory: '' },
  });

  const NAV: { id: Panel; label: string }[] = [
    { id: 'faculties',   label: 'Faculties'   },
    { id: 'departments', label: 'Departments' },
    { id: 'programmes',  label: 'Programmes'  },
    { id: 'courses',     label: 'Courses'     },
    { id: 'ccmas',       label: 'CCMAS Compliance' },
  ];

  function resetNav(p: Panel) {
    setPanel(p); setShowForm(false); setShowMappingForm(false); setEditing(null); setFormError('');
    if (p === 'faculties') { setSelectedFacId(null); setSelectedDeptId(null); setSelectedProgId(null); }
    if (p === 'departments') { setSelectedDeptId(null); setSelectedProgId(null); }
    if (p === 'programmes')  { setSelectedProgId(null); }
  }

  const mutateOpts = (reset: () => void) => ({
    onSuccess: () => { setShowForm(false); setEditing(null); reset(); setFormError(''); },
    onError:   (e: Error) => setFormError(e.message),
  });

  const canCreatePanel = panel === 'courses' ? canCreateCourse : ['faculties', 'departments', 'programmes'].includes(panel) && canCreateInstitutional;
  const panelLabel = panel === 'faculties' ? 'Faculty' : panel === 'departments' ? 'Department' : panel === 'programmes' ? 'Programme' : 'Course';

  function editFaculty(f: FacultyV1) {
    setPanel('faculties'); setEditing({ type: 'faculty', id: f.id }); setShowForm(true);
    fForm.reset({ name: f.name, code: f.code, isActive: f.isActive });
  }
  function editDepartment(d: DepartmentV1) {
    setPanel('departments'); setEditing({ type: 'department', id: d.id }); setShowForm(true);
    dForm.reset({ name: d.name, code: d.code, facultyId: d.facultyId, isActive: d.isActive });
  }
  function editProgramme(p: ProgrammeV1) {
    setPanel('programmes'); setEditing({ type: 'programme', id: p.id }); setShowForm(true);
    pForm.reset({ name: p.name, code: p.code, departmentId: p.departmentId, degreeType: p.degreeType, durationYears: p.durationYears, minCreditUnits: p.minCreditUnits, maxCreditUnits: p.maxCreditUnits, isActive: p.isActive });
  }
  function editCourse(c: CourseV1) {
    setPanel('courses'); setEditing({ type: 'course', id: c.id }); setShowForm(true);
    cForm.reset({ code: c.code, title: c.title, creditUnits: c.creditUnits, departmentId: c.departmentId, ccmasCategory: c.ccmasCategory, description: c.description ?? '', isActive: c.isActive });
  }

  function cancelForm() {
    setShowForm(false); setEditing(null); setFormError('');
    fForm.reset(); dForm.reset(); pForm.reset(); cForm.reset();
  }

  function submitMapping(data: MappingForm) {
    if (!selectedProgId) return;
    addProgrammeCourse({ programmeId: selectedProgId, courseId: data.courseId, level: data.level, semester: data.semester, isCompulsory: data.isCompulsory, ccmasCategory: data.ccmasCategory || undefined }, {
      onSuccess: () => { setShowMappingForm(false); mappingForm.reset({ level: data.level, semester: data.semester, isCompulsory: true, ccmasCategory: '' }); setFormError(''); },
      onError: (e: Error) => setFormError(e.message),
    });
  }

  function confirmRemoveMapping() {
    if (!selectedProgId || !removeMapping) return;
    removeProgrammeCourse({ programmeId: selectedProgId, courseId: removeMapping.courseId, level: removeMapping.level, semester: removeMapping.semester }, {
      onSuccess: () => { setRemoveMapping(null); setFormError(''); },
      onError: (e: Error) => setFormError(e.message),
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Curriculum Management</h2>
        {canCreatePanel && (
          <Button size="sm" onClick={() => { if (showForm) cancelForm(); else { setEditing(null); setShowForm(true); } }}>
            {showForm && !editing ? 'Cancel' : `+ New ${panelLabel}`}
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => resetNav(n.id)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              panel === n.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}>
            {n.label}
          </button>
        ))}
      </div>

      {formError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">
          {formError}
        </div>
      )}

      {/* ── Panel: Faculties ─────────────────────────────────────────────── */}
      {panel === 'faculties' && (
        <div className="space-y-3">
          {showForm && (
            <Card className="border-[--color-primary]/30">
              <CardContent className="pt-4">
                <form onSubmit={fForm.handleSubmit((d) => editing?.type === 'faculty'
                  ? updateFaculty({ id: editing.id, data: { name: d.name, isActive: d.isActive } }, mutateOpts(fForm.reset))
                  : createFaculty({ name: d.name, code: d.code }, mutateOpts(fForm.reset)))} className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="fName" required>Faculty Name</Label>
                    <Input id="fName" placeholder="Faculty of Engineering" error={fForm.formState.errors.name?.message} {...fForm.register('name')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="fCode" required>Code</Label>
                    <Input id="fCode" placeholder="ENG" error={fForm.formState.errors.code?.message} disabled={editing?.type === 'faculty'} {...fForm.register('code')} />
                  </div>
                  {editing?.type === 'faculty' && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" {...fForm.register('isActive')} /> Faculty is active</label>}
                  <div className="sm:col-span-3 flex gap-2">
                    <Button type="submit" size="sm" loading={fCreating || fUpdating}>{editing?.type === 'faculty' ? 'Save Faculty' : 'Create Faculty'}</Button>
                    {editing?.type === 'faculty' && <Button type="button" size="sm" variant="outline" onClick={cancelForm}>Cancel</Button>}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {faculties.map((f: FacultyV1) => (
              <div key={f.id} className="group rounded-lg border border-border p-4 transition-colors hover:border-[--color-primary]/50 hover:bg-blue-50/40 dark:hover:bg-blue-950/20">
                <button type="button" onClick={() => { setSelectedFacId(f.id); setPanel('departments'); }} className="w-full text-left">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-foreground">{f.name}</p>
                    <span className="rounded bg-[--color-primary]/10 px-1.5 py-0.5 font-mono text-xs text-[--color-primary]">{f.code}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{f.departmentCount} department(s) · {f.isActive ? 'Active' : 'Inactive'}</p>
                  <p className="mt-1 text-xs text-[--color-primary] opacity-0 transition-opacity group-hover:opacity-100">View departments →</p>
                </button>
                {canUpdateFaculty && <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => editFaculty(f)}>Edit faculty</Button>}
              </div>
            ))}
            {faculties.length === 0 && <p className="col-span-3 text-sm text-muted-foreground">No faculties yet.</p>}
          </div>
        </div>
      )}

      {/* ── Panel: Departments ───────────────────────────────────────────── */}
      {panel === 'departments' && (
        <div className="space-y-3">
          {/* Faculty breadcrumb */}
          {selectedFacId && (
            <button onClick={() => setPanel('faculties')} className="text-xs text-muted-foreground hover:text-foreground">
              ← {faculties.find((f: FacultyV1) => f.id === selectedFacId)?.name ?? 'All Faculties'}
            </button>
          )}
          {/* Filter by faculty */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setSelectedFacId(null); }} className={cn('rounded-full border px-3 py-1 text-xs', !selectedFacId ? 'border-[--color-primary] bg-[--color-primary]/10 text-[--color-primary]' : 'border-border text-muted-foreground hover:border-[--color-primary]/40')}>All</button>
            {faculties.map((f: FacultyV1) => (
              <button key={f.id} onClick={() => setSelectedFacId(f.id)}
                className={cn('rounded-full border px-3 py-1 text-xs', selectedFacId === f.id ? 'border-[--color-primary] bg-[--color-primary]/10 text-[--color-primary]' : 'border-border text-muted-foreground hover:border-[--color-primary]/40')}>
                {f.code}
              </button>
            ))}
          </div>

          {showForm && (
            <Card className="border-[--color-primary]/30">
              <CardContent className="pt-4">
                <form onSubmit={dForm.handleSubmit((d) => editing?.type === 'department'
                  ? updateDept({ id: editing.id, data: { name: d.name, isActive: d.isActive } }, mutateOpts(dForm.reset))
                  : createDept({ name: d.name, code: d.code, facultyId: d.facultyId }, mutateOpts(dForm.reset)))} className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-1">
                    <Label htmlFor="dFaculty" required>Faculty</Label>
                      <select id="dFaculty" disabled={editing?.type === 'department'} {...dForm.register('facultyId')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {faculties.map((f: FacultyV1) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1 sm:col-span-1">
                    <Label htmlFor="dName" required>Department Name</Label>
                    <Input id="dName" placeholder="Computer Science" error={dForm.formState.errors.name?.message} {...dForm.register('name')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dCode" required>Code</Label>
                    <Input id="dCode" placeholder="CSC" error={dForm.formState.errors.code?.message} disabled={editing?.type === 'department'} {...dForm.register('code')} />
                  </div>
                  {editing?.type === 'department' && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" {...dForm.register('isActive')} /> Department is active</label>}
                  <div className="sm:col-span-3 flex gap-2">
                    <Button type="submit" size="sm" loading={dCreating || dUpdating}>{editing?.type === 'department' ? 'Save Department' : 'Create Department'}</Button>
                    {editing?.type === 'department' && <Button type="button" size="sm" variant="outline" onClick={cancelForm}>Cancel</Button>}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((d: DepartmentV1) => (
              <div key={d.id} className="group rounded-lg border border-border p-4 transition-colors hover:border-[--color-primary]/50 hover:bg-blue-50/40 dark:hover:bg-blue-950/20">
                <button type="button" onClick={() => { setSelectedDeptId(d.id); setPanel('programmes'); }} className="w-full text-left">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-foreground">{d.name}</p>
                    <span className="rounded bg-[--color-primary]/10 px-1.5 py-0.5 font-mono text-xs text-[--color-primary]">{d.code}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{d.facultyName} · {d.isActive ? 'Active' : 'Inactive'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{d.programmeCount} programme(s) · {d.courseCount} course(s)</p>
                  <p className="mt-1 text-xs text-[--color-primary] opacity-0 transition-opacity group-hover:opacity-100">View programmes →</p>
                </button>
                {canUpdateDepartment && <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => editDepartment(d)}>Edit department</Button>}
              </div>
            ))}
            {departments.length === 0 && <p className="col-span-3 text-sm text-muted-foreground">No departments{selectedFacId ? ' in this faculty' : ''}.</p>}
          </div>
        </div>
      )}

      {/* ── Panel: Programmes ────────────────────────────────────────────── */}
      {panel === 'programmes' && (
        <div className="space-y-3">
          {selectedDeptId && (
            <button onClick={() => setPanel('departments')} className="text-xs text-muted-foreground hover:text-foreground">
              ← {departments.find((d: DepartmentV1) => d.id === selectedDeptId)?.name ?? 'Departments'}
            </button>
          )}
          {showForm && (
            <Card className="border-[--color-primary]/30">
              <CardContent className="pt-4">
                <form onSubmit={pForm.handleSubmit((d) => editing?.type === 'programme'
                  ? updateProg({ id: editing.id, data: { name: d.name, minCreditUnits: d.minCreditUnits, maxCreditUnits: d.maxCreditUnits, isActive: d.isActive } }, mutateOpts(pForm.reset))
                  : createProg({ name: d.name, code: d.code, departmentId: d.departmentId, degreeType: d.degreeType, durationYears: d.durationYears, minCreditUnits: d.minCreditUnits, maxCreditUnits: d.maxCreditUnits }, mutateOpts(pForm.reset)))} className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="pName" required>Programme Name</Label>
                    <Input id="pName" placeholder="B.Sc. Computer Science" error={pForm.formState.errors.name?.message} {...pForm.register('name')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pCode" required>Code</Label>
                    <Input id="pCode" placeholder="CSC-BSC" error={pForm.formState.errors.code?.message} disabled={editing?.type === 'programme'} {...pForm.register('code')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pDept" required>Department</Label>
                      <select id="pDept" disabled={editing?.type === 'programme'} {...pForm.register('departmentId')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {departments.map((d: DepartmentV1) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pDeg" required>Degree Type</Label>
                      <select id="pDeg" disabled={editing?.type === 'programme'} {...pForm.register('degreeType')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {DEGREE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pDur" required>Duration (years)</Label>
                    <Input id="pDur" type="number" min={1} max={7} disabled={editing?.type === 'programme'} error={pForm.formState.errors.durationYears?.message} {...pForm.register('durationYears')} />
                  </div>
                  {editing?.type === 'programme' && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" {...pForm.register('isActive')} /> Programme is active</label>}
                  <div className="sm:col-span-2 flex gap-2">
                    <Button type="submit" size="sm" loading={pCreating || pUpdating}>{editing?.type === 'programme' ? 'Save Programme' : 'Create Programme'}</Button>
                    {editing?.type === 'programme' && <Button type="button" size="sm" variant="outline" onClick={cancelForm}>Cancel</Button>}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {programmes.map((p: ProgrammeV1) => (
              <div key={p.id} className={cn('rounded-lg border p-4 text-left transition-colors',
                selectedProgId === p.id ? 'border-[--color-primary] bg-blue-50/60 dark:bg-blue-950/30' : 'border-border hover:border-[--color-primary]/40')}>
                <button type="button" onClick={() => setSelectedProgId(p.id === selectedProgId ? null : p.id)} className="w-full text-left">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    <span className="rounded bg-[--color-primary]/10 px-1.5 py-0.5 font-mono text-xs text-[--color-primary]">{p.code}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.degreeType} · {p.durationYears} years · {p.departmentName} · {p.isActive ? 'Active' : 'Inactive'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.minCreditUnits}–{p.maxCreditUnits} credit units</p>
                </button>
                {canUpdateProgramme && <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => editProgramme(p)}>Edit programme</Button>}
              </div>
            ))}
            {programmes.length === 0 && <p className="col-span-2 text-sm text-muted-foreground">No programmes yet.</p>}
          </div>

          {/* Expanded programme detail */}
          {selectedProgId && programme && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{programme.name} — Curriculum</CardTitle>
              </CardHeader>
              <CardContent>
                {canManageMappings && (
                  <div className="mb-4 rounded-lg border border-[--color-primary]/20 bg-[--color-primary]/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Curriculum mapping</p>
                        <p className="text-xs text-muted-foreground">Add an active course to a level and semester. Duplicate mappings are rejected by the API.</p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => { setShowMappingForm((value) => !value); setFormError(''); }}>{showMappingForm ? 'Cancel' : 'Add course'}</Button>
                    </div>
                    {showMappingForm && (
                      <form onSubmit={mappingForm.handleSubmit(submitMapping)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-1 lg:col-span-2">
                          <Label htmlFor="mappingCourse" required>Course</Label>
                          <select id="mappingCourse" {...mappingForm.register('courseId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                            <option value="">Select active course…</option>
                            {courses.filter((c) => c.isActive && !(programme.courses ?? []).some((mapped) => mapped.courseId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="mappingLevel" required>Level</Label>
                          <Input id="mappingLevel" type="number" min={100} max={800} {...mappingForm.register('level')} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="mappingSemester" required>Semester</Label>
                          <select id="mappingSemester" {...mappingForm.register('semester')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                            {SEMESTERS.map((semester) => <option key={semester} value={semester}>{semester}</option>)}
                          </select>
                        </div>
                        <div className="flex items-end gap-2">
                          <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" {...mappingForm.register('isCompulsory')} /> Compulsory</label>
                          <Button type="submit" size="sm" loading={mappingAdding}>Add</Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
                {(!programme.courses || programme.courses.length === 0) ? (
                  <p className="text-sm text-muted-foreground">No courses mapped to this programme yet.</p>
                ) : (
                  <div className="space-y-1">
                    {[100,200,300,400,500,600,700,800].map((level) => {
                      const levelCourses = (programme.courses ?? []).filter((c) => c.level === level);
                      if (levelCourses.length === 0) return null;
                      return (
                        <div key={level} className="rounded-md border border-border p-3">
                          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Level {level}</p>
                          <div className="space-y-1">
                            {levelCourses.map((c) => (
                              <div key={c.id} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                                <span><span className="font-mono text-xs text-[--color-primary]">{c.courseCode}</span> — {c.courseTitle}</span>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{c.creditUnits} CU</span>
                                  <span className={cn('rounded px-1.5 py-0.5', c.ccmasCategory === 'CORE' ? 'badge-success' : c.ccmasCategory === 'ELECTIVE' ? 'badge-info' : 'badge-neutral')}>{c.ccmasCategory}</span>
                                  <span>{c.semester}</span>
                                  {canManageMappings && <Button type="button" size="sm" variant="outline" onClick={() => setRemoveMapping({ courseId: c.courseId, courseCode: c.courseCode, level: c.level, semester: c.semester })}>Remove</Button>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Panel: Courses ───────────────────────────────────────────────── */}
      {panel === 'courses' && (
        <div className="space-y-3">
          {showForm && (
            <Card className="border-[--color-primary]/30">
              <CardContent className="pt-4">
                <form onSubmit={cForm.handleSubmit((d) => editing?.type === 'course'
                  ? updateCourse({ id: editing.id, data: { title: d.title, ccmasCategory: d.ccmasCategory, description: d.description, isActive: d.isActive } }, mutateOpts(cForm.reset))
                  : createCourse({ code: d.code, title: d.title, creditUnits: d.creditUnits, departmentId: d.departmentId, ccmasCategory: d.ccmasCategory, description: d.description }, mutateOpts(cForm.reset)))} className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="cCode" required>Course Code</Label>
                    <Input id="cCode" placeholder="CSC301" error={cForm.formState.errors.code?.message} disabled={editing?.type === 'course'} {...cForm.register('code')} />
                  </div>
                  <div className="space-y-1 sm:col-span-1">
                    <Label htmlFor="cTitle" required>Title</Label>
                    <Input id="cTitle" placeholder="Data Structures and Algorithms" error={cForm.formState.errors.title?.message} {...cForm.register('title')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cDept" required>Department</Label>
                      <select id="cDept" disabled={editing?.type === 'course'} {...cForm.register('departmentId')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {departments.map((d: DepartmentV1) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cCU" required>Credit Units</Label>
                    <Input id="cCU" type="number" min={1} max={12} disabled={editing?.type === 'course'} error={cForm.formState.errors.creditUnits?.message} {...cForm.register('creditUnits')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cCat" required>CCMAS Category</Label>
                    <select id="cCat" {...cForm.register('ccmasCategory')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {CCMAS_CATS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="cDescription">Description</Label>
                    <textarea id="cDescription" rows={3} placeholder="Brief course description, learning focus, or catalogue note" {...cForm.register('description')} className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  </div>
                  {editing?.type === 'course' && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" {...cForm.register('isActive')} /> Course is active</label>}
                  <div className="sm:col-span-2 flex gap-2">
                    <Button type="submit" size="sm" loading={cCreating || cUpdating}>{editing?.type === 'course' ? 'Save Course' : 'Create Course'}</Button>
                    {editing?.type === 'course' && <Button type="button" size="sm" variant="outline" onClick={cancelForm}>Cancel</Button>}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {['Code','Title','Dept','CU','Category','Status','Actions'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {courses.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">No courses yet.</td></tr>
                )}
                {courses.map((c) => (
                  <tr key={c.id} className={cn('hover:bg-muted/40 transition-colors', requestedCourseId === c.id && 'bg-[--color-primary]/10 ring-1 ring-inset ring-[--color-primary]')}>
                    <td className="px-4 py-2.5 font-mono text-xs text-[--color-primary]">{c.code}</td>
                    <td className="px-4 py-2.5 text-foreground">{c.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.departmentCode}</td>
                    <td className="px-4 py-2.5 text-foreground">{c.creditUnits}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', c.ccmasCategory === 'CORE' ? 'badge-success' : c.ccmasCategory === 'ELECTIVE' ? 'badge-info' : 'badge-neutral')}>
                        {c.ccmasCategory}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', c.isActive ? 'badge-success' : 'badge-neutral')}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{canUpdateCourse && <Button type="button" size="sm" variant="outline" onClick={() => editCourse(c)}>Edit</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Panel: CCMAS Compliance ──────────────────────────────────────── */}
      {panel === 'ccmas' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">NUC requires ≥70% of all credit units in each programme to be categorised as CORE.</p>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {['Programme','Code','Core CU','Total CU','Core %','Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ccmas.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No programme data.</td></tr>
                )}
                {ccmas.map((r) => (
                  <tr key={r.programmeId} className={cn('transition-colors', r.isCompliant ? '' : 'bg-red-50/40 dark:bg-red-950/20')}>
                    <td className="px-4 py-2.5 text-foreground">{r.programmeName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[--color-primary]">{r.programmeCode}</td>
                    <td className="px-4 py-2.5 text-foreground">{r.coreUnits}</td>
                    <td className="px-4 py-2.5 text-foreground">{r.totalUnits}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div className={cn('h-full rounded-full transition-all', r.corePct >= 70 ? 'bg-[--color-success]' : 'bg-[--color-danger]')}
                               style={{ width: `${Math.min(r.corePct, 100)}%` }} />
                        </div>
                        <span className="text-xs font-medium">{r.corePct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', r.isCompliant ? 'badge-success' : 'badge-danger')}>
                        {r.isCompliant ? '✓ Compliant' : '✗ Non-compliant'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ConfirmAction
        open={!!removeMapping}
        title="Remove course from curriculum?"
        description={removeMapping ? `${removeMapping.courseCode} will be removed from Level ${removeMapping.level}, ${removeMapping.semester} in the active curriculum version.` : undefined}
        confirmLabel={mappingRemoving ? 'Removing…' : 'Remove course'}
        destructive
        onConfirm={confirmRemoveMapping}
        onCancel={() => setRemoveMapping(null)}
      />
    </div>
  );
}
