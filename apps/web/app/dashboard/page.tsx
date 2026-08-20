'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Bell, BookOpen, CalendarDays, CheckCircle2,
  CircleAlert, Clock3, FileText, GraduationCap, HelpCircle, LayoutGrid,
  Settings2, ShieldCheck, Sparkles, WalletCards, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useMyDashboard } from '@/hooks/use-reports';
import type { DashboardSnapshotV1 } from '@uniportal/types';
import type { RoleName } from '@uniportal/types';
import { cn } from '@/lib/utils';
import { effectiveRolesOf } from '@/lib/authz';
import { DashboardCommandPalette } from '@/components/dashboard/dashboard-command-palette';

const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: 'System Administrator', VC: 'Vice Chancellor', REGISTRAR: 'Registrar',
  DEAN: 'Dean', HOD: 'Head of Department', BURSAR: 'Bursar', HR_MANAGER: 'HR Manager',
  SUPPORT_STAFF: 'Support Staff', STAFF: 'Staff', STUDENT: 'Student',
};

const ROLE_COPY: Record<RoleName, { title: string; description: string; primary: { href: string; label: string } }> = {
  SUPER_ADMIN: { title: 'System control centre', description: 'Govern the platform, security, configuration and operational health.', primary: { href: '/dashboard/settings', label: 'Open administration' } },
  VC: { title: 'Executive command centre', description: 'See institutional performance, exceptions and decision-ready signals.', primary: { href: '/dashboard/reports', label: 'Open executive reports' } },
  REGISTRAR: { title: 'Academic operations', description: 'Keep admissions, records, results, progression and graduation moving.', primary: { href: '/dashboard/admissions', label: 'Review admissions' } },
  DEAN: { title: 'Faculty workspace', description: 'Focus on faculty performance, students and decisions within your scope.', primary: { href: '/dashboard/academic', label: 'Open faculty academics' } },
  HOD: { title: 'Department workspace', description: 'Coordinate courses, students, results and academic decisions for your department.', primary: { href: '/dashboard/results', label: 'Review results' } },
  BURSAR: { title: 'Finance command centre', description: 'Monitor collections, outstanding obligations and financial exceptions.', primary: { href: '/dashboard/fees', label: 'Open finance' } },
  HR_MANAGER: { title: 'People operations', description: 'Manage workforce activity, leave and payroll with clear priorities.', primary: { href: '/dashboard/hr', label: 'Open HR' } },
  SUPPORT_STAFF: { title: 'Support workspace', description: 'Help students and staff resolve operational requests quickly and safely.', primary: { href: '/dashboard/students', label: 'Find a student' } },
  STAFF: { title: 'Your university workspace', description: 'Access services, tasks and academic information available to your role.', primary: { href: '/dashboard/academic', label: 'Open academic life' } },
  STUDENT: { title: 'My university', description: 'A focused view of your academic journey, finances and university services.', primary: { href: '/dashboard/academic', label: 'Open academic life' } },
};

const ACTIONS: Record<RoleName, { href: string; label: string; description: string; icon: typeof BookOpen }[]> = {
  STUDENT: [
    { href: '/dashboard/academic', label: 'Academic life', description: 'Registration, progress and graduation readiness', icon: GraduationCap },
    { href: '/dashboard/results', label: 'Results & transcript', description: 'Grades and academic history', icon: FileText },
    { href: '/dashboard/calendar', label: 'Calendar', description: 'Important academic dates', icon: CalendarDays },
    { href: '/dashboard/fees', label: 'Fees & payments', description: 'Review obligations and receipts', icon: WalletCards },
  ],
  REGISTRAR: [
    { href: '/dashboard/admissions', label: 'Admissions', description: 'Review applications and decisions', icon: CheckCircle2 },
    { href: '/dashboard/students', label: 'Student records', description: 'Manage the student lifecycle', icon: GraduationCap },
    { href: '/dashboard/results', label: 'Results', description: 'Monitor processing and approvals', icon: FileText },
    { href: '/dashboard/academic', label: 'Academic operations', description: 'Registration and progression', icon: BookOpen },
  ],
  DEAN: [
    { href: '/dashboard/academic', label: 'Faculty academics', description: 'Monitor academic lifecycle activity', icon: BookOpen },
    { href: '/dashboard/results', label: 'Results', description: 'Review faculty result activity', icon: FileText },
    { href: '/dashboard/students', label: 'Students', description: 'Review permitted academic records', icon: GraduationCap },
    { href: '/dashboard/reports', label: 'Reports', description: 'Use evidence for decisions', icon: LayoutGrid },
  ],
  HOD: [
    { href: '/dashboard/academic', label: 'Academic operations', description: 'Courses, registration and progression', icon: BookOpen },
    { href: '/dashboard/results', label: 'Results & grades', description: 'Review departmental results', icon: FileText },
    { href: '/dashboard/students', label: 'Students', description: 'Find permitted student records', icon: GraduationCap },
    { href: '/dashboard/calendar', label: 'Calendar', description: 'Teaching and academic dates', icon: CalendarDays },
  ],
  BURSAR: [
    { href: '/dashboard/fees', label: 'Fees & payments', description: 'Monitor financial activity', icon: WalletCards },
    { href: '/dashboard/reports', label: 'Financial reports', description: 'Review finance reporting', icon: FileText },
    { href: '/dashboard/students', label: 'Student accounts', description: 'Support account enquiries', icon: GraduationCap },
    { href: '/dashboard/clearance', label: 'Clearance status', description: 'Review finance-related clearance items', icon: ShieldCheck },
  ],
  HR_MANAGER: [
    { href: '/dashboard/hr', label: 'HR', description: 'Staff records and HR operations', icon: GraduationCap },
    { href: '/dashboard/payroll', label: 'Payroll', description: 'Payroll operations', icon: WalletCards },
    { href: '/dashboard/reports', label: 'Reports', description: 'People and payroll reporting', icon: FileText },
    { href: '/dashboard/enterprise', label: 'Enterprise operations', description: 'Review operational workflows', icon: ShieldCheck },
  ],
  VC: [
    { href: '/dashboard/reports', label: 'Executive reports', description: 'Decision-ready reporting', icon: FileText },
    { href: '/dashboard/academic', label: 'Academic overview', description: 'Academic lifecycle', icon: BookOpen },
    { href: '/dashboard/admissions', label: 'Admissions', description: 'Enrollment pipeline', icon: CheckCircle2 },
    { href: '/dashboard/policies', label: 'University policies', description: 'Review approved institutional policy', icon: ShieldCheck },
  ],
  SUPER_ADMIN: [
    { href: '/dashboard/settings', label: 'System settings', description: 'Institutional configuration', icon: Settings2 },
    { href: '/dashboard/audit-logs', label: 'Audit & security', description: 'Security-sensitive activity', icon: ShieldCheck },
    { href: '/dashboard/reports', label: 'Reports', description: 'Operational reporting', icon: FileText },
    { href: '/dashboard/students', label: 'Student records', description: 'Academic lifecycle', icon: GraduationCap },
  ],
  SUPPORT_STAFF: [
    { href: '/dashboard/students', label: 'Students', description: 'Find students within your access', icon: GraduationCap },
    { href: '/dashboard/calendar', label: 'Calendar', description: 'Important university dates', icon: CalendarDays },
    { href: '/dashboard/reports', label: 'Reports', description: 'Available support reporting', icon: FileText },
    { href: '/dashboard/notifications', label: 'Notifications', description: 'Review operational updates', icon: Bell },
  ],
  STAFF: [
    { href: '/dashboard/academic', label: 'Academic life', description: 'Services available to your scope', icon: BookOpen },
    { href: '/dashboard/results', label: 'Results & grades', description: 'Assessment and results', icon: FileText },
    { href: '/dashboard/calendar', label: 'Calendar', description: 'Important university dates', icon: CalendarDays },
    { href: '/dashboard/reports', label: 'Reports', description: 'Available operational reports', icon: LayoutGrid },
  ],
};

function formatNumber(value: number) { return new Intl.NumberFormat('en-NG').format(value); }
function formatMoney(value: number) { return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value); }

function Metric({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail?: string; tone?: 'neutral' | 'positive' | 'warning' }) {
  return <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
    {detail ? <p className={cn('mt-1 text-xs', tone === 'positive' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{detail}</p> : null}
  </article>;
}

function SnapshotMetrics({ snapshot }: { snapshot: DashboardSnapshotV1 }) {
  if (snapshot.kind === 'student') {
    const d = snapshot.data;
    const outstanding = d.outstandingFees.reduce((sum, fee) => sum + Number(fee.balance), 0);
    return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Current CGPA" value={String(d.student.cgpa)} detail={`${d.student.level} level · ${d.student.status}`} tone="positive" />
      <Metric label="Fee status" value={d.student.feeCleared ? 'Cleared' : formatMoney(outstanding)} detail={d.student.feeCleared ? 'No outstanding fee shown' : 'Outstanding balance'} tone={d.student.feeCleared ? 'positive' : 'warning'} />
      <Metric label="Graduation clearance" value={d.clearance.allCleared ? 'Complete' : 'In progress'} detail={`${d.clearance.items.length} clearance items`} tone={d.clearance.allCleared ? 'positive' : 'warning'} />
      <Metric label="Active library loans" value={String(d.activeLoans.length)} detail={d.activeLoans.some((l) => new Date(l.dueDate) < new Date()) ? 'At least one overdue' : 'No overdue item detected'} tone={d.activeLoans.some((l) => new Date(l.dueDate) < new Date()) ? 'warning' : 'positive'} />
    </div>;
  }
  if (snapshot.kind === 'executive') return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Students" value={formatNumber(snapshot.data.students.total)} detail={snapshot.data.academicCalendar ? `${snapshot.data.academicCalendar.academicYear} · ${snapshot.data.academicCalendar.status}` : 'No active academic calendar'} /><Metric label="Collected" value={formatMoney(snapshot.data.fees.totalCollected)} detail={`${snapshot.data.fees.collectionRate} collection rate`} tone="positive" /><Metric label="Results pending" value={formatNumber(snapshot.data.results.pendingPublication)} detail="Awaiting publication workflow" tone={snapshot.data.results.pendingPublication ? 'warning' : 'positive'} /><Metric label="Active payroll runs" value={formatNumber(snapshot.data.payroll.activeRuns)} detail="Current in-flight runs" /></div>;
  if (snapshot.kind === 'department') return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active students" value={formatNumber(snapshot.data.totalActiveStudents)} /><Metric label="Courses" value={formatNumber(snapshot.data.totalCourses)} /><Metric label="Active staff" value={formatNumber(snapshot.data.totalActiveStaff)} /><Metric label="Results awaiting approval" value={formatNumber(snapshot.data.resultsAwaitingHodApproval)} detail="Requires review" tone={snapshot.data.resultsAwaitingHodApproval ? 'warning' : 'positive'} /></div>;
  if (snapshot.kind === 'faculty') return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active students" value={formatNumber(snapshot.data.students)} /><Metric label="Departments" value={formatNumber(snapshot.data.departments)} /><Metric label="Active staff" value={formatNumber(snapshot.data.staff)} /><Metric label="Pending results" value={formatNumber(snapshot.data.pendingResults)} detail="Within faculty scope" tone={snapshot.data.pendingResults ? 'warning' : 'positive'} /></div>;
  if (snapshot.kind === 'finance') return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Outstanding" value={formatMoney(snapshot.data.outstanding)} detail={`${snapshot.data.invoiceCount.toLocaleString()} invoices`} tone={snapshot.data.outstanding ? 'warning' : 'positive'} /><Metric label="Collected" value={formatMoney(snapshot.data.collected)} detail={`${snapshot.data.collectionRate}% collection rate`} tone="positive" /><Metric label="Last 7 days" value={formatMoney(snapshot.data.last7DaysAmount)} detail={`${snapshot.data.last7DaysCount} successful payments`} /><Metric label="Reversed payments" value={formatNumber(snapshot.data.pendingRefunds)} detail="Requires reconciliation review" tone={snapshot.data.pendingRefunds ? 'warning' : 'positive'} /></div>;
  if (snapshot.kind === 'people') return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Total staff" value={formatNumber(snapshot.data.totalStaff)} /><Metric label="Active payroll runs" value={formatNumber(snapshot.data.activePayroll)} /><Metric label="Pending leave" value={formatNumber(snapshot.data.pendingLeave)} detail="Requires review" tone={snapshot.data.pendingLeave ? 'warning' : 'positive'} /></div>;
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Students" value={formatNumber(snapshot.data.students)} /><Metric label="Courses" value={formatNumber(snapshot.data.courses)} /><Metric label="Pending results" value={formatNumber(snapshot.data.pendingResults)} detail="Within your permitted scope" tone={snapshot.data.pendingResults ? 'warning' : 'positive'} /></div>;
}

function SmartSummary({ snapshot, role }: { snapshot: DashboardSnapshotV1; role: RoleName }) {
  const summary = useMemo(() => {
    if (snapshot.kind === 'student') {
      const due = snapshot.data.outstandingFees.reduce((sum, f) => sum + Number(f.balance), 0);
      const overdueLoans = snapshot.data.activeLoans.filter((l) => new Date(l.dueDate) < new Date()).length;
      if (!snapshot.data.student.feeCleared && due > 0) return `Your account shows ${formatMoney(due)} outstanding. Review your fee account before registration or other gated services.`;
      if (!snapshot.data.clearance.allCleared) return 'Your clearance is still in progress. Review the outstanding items and complete only the steps that apply to you.';
      if (overdueLoans) return `You have ${overdueLoans} overdue library item${overdueLoans > 1 ? 's' : ''}. Review the loan details to avoid additional fines.`;
      return 'You are up to date on the dashboard signals available to you. Check your calendar and academic workspace for what is next.';
    }
    if (snapshot.kind === 'executive') return snapshot.data.results.pendingPublication ? `${formatNumber(snapshot.data.results.pendingPublication)} results are still in the publication workflow. Review the academic exception before the next reporting cycle.` : 'No result-publication exception is currently reported by the dashboard snapshot.';
    if (snapshot.kind === 'department') return snapshot.data.resultsAwaitingHodApproval ? `${formatNumber(snapshot.data.resultsAwaitingHodApproval)} result records require departmental attention.` : 'No departmental result-approval backlog is currently reported.';
    if (snapshot.kind === 'faculty') return snapshot.data.pendingResults ? `${formatNumber(snapshot.data.pendingResults)} result records require attention within the faculty scope.` : 'No faculty result backlog is currently reported.';
    if (snapshot.kind === 'finance') return snapshot.data.outstanding > 0 ? `${formatMoney(snapshot.data.outstanding)} remains outstanding across the current fee records. Use reconciliation and account views to investigate exceptions.` : 'No outstanding fee balance is reported by the current finance snapshot.';
    if (snapshot.kind === 'people') return snapshot.data.pendingLeave ? `${formatNumber(snapshot.data.pendingLeave)} leave request${snapshot.data.pendingLeave > 1 ? 's are' : ' is'} awaiting review.` : 'No pending leave request is reported by the current HR snapshot.';
    return snapshot.data.pendingResults ? `${formatNumber(snapshot.data.pendingResults)} result records require attention within your permitted workspace.` : `Your ${ROLE_LABELS[role].toLowerCase()} workspace has no result backlog reported by the current snapshot.`;
  }, [snapshot, role]);

  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="smart-summary-title">
    <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[--color-primary]/10 text-[--color-primary]"><Sparkles className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 id="smart-summary-title" className="text-sm font-semibold">Smart summary</h2><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Based on verified dashboard data</span></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{summary}</p></div></div>
  </section>;
}

function TodayCard({ role }: { role: RoleName }) {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="today-title">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today</p><h2 id="today-title" className="mt-1 text-lg font-bold">{date}</h2><p className="mt-1 text-sm text-muted-foreground">{ROLE_LABELS[role]} workspace · use the action cards below to move work forward.</p></div><Clock3 className="h-5 w-5 text-muted-foreground" /></div>
    <div className="mt-5 rounded-xl bg-muted/50 p-4"><p className="text-sm font-medium">No invented schedule</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Timetables, deadlines and appointments should come from live university services. This dashboard intentionally avoids fabricating events when a source is unavailable.</p></div>
  </section>;
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const role = user?.primaryRole ?? effectiveRolesOf(user)[0] ?? 'STUDENT';
  const { data: snapshot, isLoading, isError, refetch } = useMyDashboard();
  const copy = ROLE_COPY[role];
  const quickActions = ACTIONS[role];
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`uniportal:dashboard:${role}:hidden`);
      if (stored) setHidden(JSON.parse(stored) as Record<string, boolean>);
    } catch { /* preferences are optional and never block dashboard rendering */ }
  }, [role]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`uniportal:dashboard:${role}:hidden`, JSON.stringify(hidden));
    } catch { /* preferences are optional */ }
  }, [hidden, role]);
  const displayName = snapshot?.kind === 'student' ? snapshot.data.student.firstName : user?.email?.split('@')[0]?.replace(/[._-]/g, ' ') || 'there';
  const hour = new Date().getHours();
  const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const toggle = (key: string) => setHidden((current) => ({ ...current, [key]: !current[key] }));

  return <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-10">
    <header className="glass-accent rounded-3xl p-5 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2"><span className="enterprise-eyebrow">{salutation}, {displayName}</span><span className="rounded-full bg-[--color-primary]/10 px-2 py-1 text-xs font-semibold">{ROLE_LABELS[role]}</span></div><h1 className="text-balance mt-2 text-2xl font-bold tracking-tight sm:text-4xl">{copy.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.description}</p></div>
        <div className="flex flex-wrap gap-2"><DashboardCommandPalette role={role} /><button type="button" onClick={() => setCustomizeOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted" aria-label="Customize dashboard"><Settings2 className="h-4 w-4" />Customize</button><Link href={copy.primary.href} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[--color-primary] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[--color-primary-dark]">{copy.primary.label}<ArrowRight className="h-4 w-4" /></Link></div>
      </div>
      {snapshot?.kind === 'student' ? <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-3 py-1.5">{snapshot.data.student.matricNo}</span><span className="rounded-full bg-muted px-3 py-1.5">{snapshot.data.student.programme.name}</span><span className="rounded-full bg-muted px-3 py-1.5">{snapshot.data.student.department.name}</span></div> : null}
    </header>

    {isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-muted/50" />)}</div> : null}
    {isError ? <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5" role="alert"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 text-destructive" /><div className="flex-1"><h2 className="text-sm font-semibold">Dashboard data is temporarily unavailable</h2><p className="mt-1 text-sm text-muted-foreground">The interface remains usable, but live metrics were not returned. No placeholder figures are shown.</p><button type="button" onClick={() => refetch()} className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-background px-3 text-sm font-semibold ring-1 ring-border hover:bg-muted">Try again</button></div></div></section> : null}

    {snapshot && !hidden.metrics ? <SnapshotMetrics snapshot={snapshot} /> : null}
    {snapshot && !hidden.summary ? <SmartSummary snapshot={snapshot} role={role} /> : null}
    {!hidden.today ? <TodayCard role={role} /> : null}

    {!hidden.actions ? <section aria-labelledby="actions-heading"><div className="mb-3 flex items-end justify-between gap-4"><div><h2 id="actions-heading" className="text-base font-semibold">Next best actions</h2><p className="text-sm text-muted-foreground">Clear entry points for the work most relevant to your role.</p></div><Bell className="h-5 w-5 text-muted-foreground" /></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickActions.map((action, index) => { const Icon = action.icon; return <Link key={action.href} href={action.href} className={cn('group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[--color-primary]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]', index === 0 && 'xl:col-span-2 xl:p-6')}><div className="flex items-start justify-between gap-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[--color-primary]/10 text-[--color-primary]"><Icon className="h-5 w-5" /></span><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[--color-primary]" /></div><h3 className={cn('mt-4 text-sm font-semibold', index === 0 && 'xl:text-base')}>{action.label}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{action.description}</p></Link>; })}</div></section> : null}

    {!hidden.trust ? <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[--color-primary]" /><div><h2 className="text-sm font-semibold">Privacy & access</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Dashboard data follows your role and organizational scope. Sensitive information is not exposed merely because it exists in the system.</p></div></div></div><div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center gap-3"><HelpCircle className="h-5 w-5 text-[--color-primary]" /><div><h2 className="text-sm font-semibold">Need help?</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Use the relevant service page or contact authorized university support. Never attempt to bypass an access restriction.</p></div></div></div></section> : null}

    {customizeOpen ? <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="customize-title"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 id="customize-title" className="text-base font-semibold">Customize dashboard</h2><p className="mt-1 text-xs text-muted-foreground">Hide sections you do not need. Your choice only affects this interface.</p></div><button type="button" onClick={() => setCustomizeOpen(false)} className="rounded-lg p-2 hover:bg-muted" aria-label="Close customization"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-2">{[['metrics','Key metrics'],['summary','Smart summary'],['today','Today'],['actions','Next best actions'],['trust','Privacy & access']].map(([key,label]) => <button key={key} type="button" onClick={() => toggle(key)} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border px-3 text-sm hover:bg-muted"><span>{label}</span><span className={cn('rounded-full px-2 py-1 text-xs font-semibold', hidden[key] ? 'bg-muted text-muted-foreground' : 'bg-[--color-primary]/10 text-[--color-primary]')}>{hidden[key] ? 'Hidden' : 'Shown'}</span></button>)}</div><button type="button" onClick={() => { setHidden({}); setCustomizeOpen(false); }} className="mt-4 min-h-11 w-full rounded-xl bg-[--color-primary] px-4 text-sm font-semibold text-white">Reset dashboard</button></div></div> : null}
  </div>;
}
