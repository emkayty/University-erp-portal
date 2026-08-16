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
  useCreateFaculty, useCreateDepartment, useCreateProgramme, useCreateCourse,
} from '@/hooks/use-curriculum';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import type { FacultyV1, DepartmentV1, ProgrammeV1 } from '@uniportal/types';

type Panel = 'faculties' | 'departments' | 'programmes' | 'courses' | 'ccmas';

const DEGREE_TYPES = ['BSC','BA','BENG','BTECH','HND','ND','MASTERS','PHD','DIPLOMA','PGDIP','OTHER'];
const CCMAS_CATS   = ['CORE','ELECTIVE','GENERAL_STUDIES'];

// ─── Schemas ─────────────────────────────────────────────────────────────────
const facultySchema    = z.object({ name: z.string().min(2), code: z.string().min(2).max(10) });
const deptSchema       = z.object({ name: z.string().min(2), code: z.string().min(2).max(10), facultyId: z.string().uuid() });
const programmeSchema  = z.object({
  name: z.string().min(2), code: z.string().min(2).max(20),
  departmentId: z.string().uuid(), degreeType: z.string().min(1),
  durationYears: z.coerce.number().min(1).max(7),
  minCreditUnits: z.coerce.number().min(60).optional(),
  maxCreditUnits: z.coerce.number().min(90).optional(),
});
const courseSchema = z.object({
  code: z.string().min(2).max(20), title: z.string().min(2),
  creditUnits: z.coerce.number().min(1).max(12),
  departmentId: z.string().uuid(), ccmasCategory: z.string().min(1),
  description: z.string().optional(),
});

type FacultyForm   = z.infer<typeof facultySchema>;
type DeptForm      = z.infer<typeof deptSchema>;
type ProgrammeForm = z.infer<typeof programmeSchema>;
type CourseForm    = z.infer<typeof courseSchema>;

export default function CurriculumPage() {
  const searchParams = useSearchParams();
  const requestedPanel = searchParams.get('panel');
  const requestedCourseId = searchParams.get('courseId');
  const user      = useAuthStore((s) => s.user);
  const canManage = ['SUPER_ADMIN','REGISTRAR','DEAN','HOD'].includes(user?.primaryRole ?? '');

  const [panel,         setPanel]         = useState<Panel>(requestedPanel === 'courses' ? 'courses' : 'faculties');
  const [selectedFacId, setSelectedFacId] = useState<string | null>(null);
  const [selectedDeptId,setSelectedDeptId]= useState<string | null>(null);
  const [selectedProgId,setSelectedProgId]= useState<string | null>(null);
  const [showForm,      setShowForm]      = useState(false);
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
  const { mutate: createDept,     isPending: dCreating } = useCreateDepartment();
  const { mutate: createProg,     isPending: pCreating } = useCreateProgramme();
  const { mutate: createCourse,   isPending: cCreating } = useCreateCourse();

  const fForm = useForm<FacultyForm>  ({ resolver: zodResolver(facultySchema) });
  const dForm = useForm<DeptForm>     ({ resolver: zodResolver(deptSchema) });
  const pForm = useForm<ProgrammeForm>({ resolver: zodResolver(programmeSchema) });
  const cForm = useForm<CourseForm>   ({ resolver: zodResolver(courseSchema) });

  const NAV: { id: Panel; label: string }[] = [
    { id: 'faculties',   label: 'Faculties'   },
    { id: 'departments', label: 'Departments' },
    { id: 'programmes',  label: 'Programmes'  },
    { id: 'courses',     label: 'Courses'     },
    { id: 'ccmas',       label: 'CCMAS Compliance' },
  ];

  function resetNav(p: Panel) {
    setPanel(p); setShowForm(false); setFormError('');
    if (p === 'faculties') { setSelectedFacId(null); setSelectedDeptId(null); setSelectedProgId(null); }
    if (p === 'departments') { setSelectedDeptId(null); setSelectedProgId(null); }
    if (p === 'programmes')  { setSelectedProgId(null); }
  }

  const mutateOpts = (reset: () => void) => ({
    onSuccess: () => { setShowForm(false); reset(); setFormError(''); },
    onError:   (e: Error) => setFormError(e.message),
  });

  return (
    <div className="space-y-4">
      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Curriculum Management</h2>
        {canManage && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : `+ New ${panel.slice(0,-1)}`}
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
                <form onSubmit={fForm.handleSubmit((d) => createFaculty(d, mutateOpts(fForm.reset)))} className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="fName" required>Faculty Name</Label>
                    <Input id="fName" placeholder="Faculty of Engineering" error={fForm.formState.errors.name?.message} {...fForm.register('name')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="fCode" required>Code</Label>
                    <Input id="fCode" placeholder="ENG" error={fForm.formState.errors.code?.message} {...fForm.register('code')} />
                  </div>
                  <div className="sm:col-span-3">
                    <Button type="submit" size="sm" loading={fCreating}>Create Faculty</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {faculties.map((f: FacultyV1) => (
              <button key={f.id}
                onClick={() => { setSelectedFacId(f.id); setPanel('departments'); }}
                className="group rounded-lg border border-border p-4 text-left transition-colors hover:border-[--color-primary]/50 hover:bg-blue-50/40 dark:hover:bg-blue-950/20">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-semibold text-foreground">{f.name}</p>
                  <span className="rounded bg-[--color-primary]/10 px-1.5 py-0.5 font-mono text-xs text-[--color-primary]">{f.code}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{f.departmentCount} department(s)</p>
                <p className="mt-1 text-xs text-[--color-primary] opacity-0 transition-opacity group-hover:opacity-100">View departments →</p>
              </button>
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
                <form onSubmit={dForm.handleSubmit((d) => createDept(d, mutateOpts(dForm.reset)))} className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-1">
                    <Label htmlFor="dFaculty" required>Faculty</Label>
                    <select id="dFaculty" {...dForm.register('facultyId')}
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
                    <Input id="dCode" placeholder="CSC" error={dForm.formState.errors.code?.message} {...dForm.register('code')} />
                  </div>
                  <div className="sm:col-span-3">
                    <Button type="submit" size="sm" loading={dCreating}>Create Department</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((d: DepartmentV1) => (
              <button key={d.id}
                onClick={() => { setSelectedDeptId(d.id); setPanel('programmes'); }}
                className="group rounded-lg border border-border p-4 text-left transition-colors hover:border-[--color-primary]/50 hover:bg-blue-50/40 dark:hover:bg-blue-950/20">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-semibold text-foreground">{d.name}</p>
                  <span className="rounded bg-[--color-primary]/10 px-1.5 py-0.5 font-mono text-xs text-[--color-primary]">{d.code}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{d.facultyName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{d.programmeCount} programme(s) · {d.courseCount} course(s)</p>
                <p className="mt-1 text-xs text-[--color-primary] opacity-0 transition-opacity group-hover:opacity-100">View programmes →</p>
              </button>
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
                <form onSubmit={pForm.handleSubmit((d) => createProg(d, mutateOpts(pForm.reset)))} className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="pName" required>Programme Name</Label>
                    <Input id="pName" placeholder="B.Sc. Computer Science" error={pForm.formState.errors.name?.message} {...pForm.register('name')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pCode" required>Code</Label>
                    <Input id="pCode" placeholder="CSC-BSC" error={pForm.formState.errors.code?.message} {...pForm.register('code')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pDept" required>Department</Label>
                    <select id="pDept" {...pForm.register('departmentId')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {departments.map((d: DepartmentV1) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pDeg" required>Degree Type</Label>
                    <select id="pDeg" {...pForm.register('degreeType')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {DEGREE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pDur" required>Duration (years)</Label>
                    <Input id="pDur" type="number" min={1} max={7} error={pForm.formState.errors.durationYears?.message} {...pForm.register('durationYears')} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" size="sm" loading={pCreating}>Create Programme</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {programmes.map((p: ProgrammeV1) => (
              <button key={p.id} onClick={() => setSelectedProgId(p.id === selectedProgId ? null : p.id)}
                className={cn('rounded-lg border p-4 text-left transition-colors',
                  selectedProgId === p.id ? 'border-[--color-primary] bg-blue-50/60 dark:bg-blue-950/30' : 'border-border hover:border-[--color-primary]/40')}>
                <div className="flex items-start justify-between">
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <span className="rounded bg-[--color-primary]/10 px-1.5 py-0.5 font-mono text-xs text-[--color-primary]">{p.code}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.degreeType} · {p.durationYears} years · {p.departmentName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.minCreditUnits}–{p.maxCreditUnits} credit units</p>
              </button>
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
                              <div key={c.id} className="flex items-center justify-between text-sm">
                                <span><span className="font-mono text-xs text-[--color-primary]">{c.courseCode}</span> — {c.courseTitle}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{c.creditUnits} CU</span>
                                  <span className={cn('rounded px-1.5 py-0.5', c.ccmasCategory === 'CORE' ? 'badge-success' : c.ccmasCategory === 'ELECTIVE' ? 'badge-info' : 'badge-neutral')}>{c.ccmasCategory}</span>
                                  <span>{c.semester}</span>
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
                <form onSubmit={cForm.handleSubmit((d) => createCourse(d, mutateOpts(cForm.reset)))} className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="cCode" required>Course Code</Label>
                    <Input id="cCode" placeholder="CSC301" error={cForm.formState.errors.code?.message} {...cForm.register('code')} />
                  </div>
                  <div className="space-y-1 sm:col-span-1">
                    <Label htmlFor="cTitle" required>Title</Label>
                    <Input id="cTitle" placeholder="Data Structures and Algorithms" error={cForm.formState.errors.title?.message} {...cForm.register('title')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cDept" required>Department</Label>
                    <select id="cDept" {...cForm.register('departmentId')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {departments.map((d: DepartmentV1) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cCU" required>Credit Units</Label>
                    <Input id="cCU" type="number" min={1} max={12} error={cForm.formState.errors.creditUnits?.message} {...cForm.register('creditUnits')} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cCat" required>CCMAS Category</Label>
                    <select id="cCat" {...cForm.register('ccmasCategory')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select…</option>
                      {CCMAS_CATS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" size="sm" loading={cCreating}>Create Course</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {['Code','Title','Dept','CU','Category','Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {courses.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No courses yet.</td></tr>
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
    </div>
  );
}
