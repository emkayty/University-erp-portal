'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useGenerateReport, useMyReportJobs,
  useEnrolmentStats, useRevenueReport, useCgpaDistribution, useResultsStats,
} from '@/hooks/use-reports';
import { cn, formatDate } from '@/lib/utils';
import { effectiveRolesOf, hasEffectiveAnyRole } from '@/lib/authz';
import { useAuthStore } from '@/stores/auth.store';
import type { ReportType, RoleName } from '@uniportal/types';

const REPORT_TYPES: { value: ReportType; label: string; desc: string; roles: RoleName[] }[] = [
  { value: 'ENROLMENT',          label: 'Enrolment Statistics', desc: 'Students by status, level, gender & mode', roles: ['REGISTRAR','VC','HOD','SUPER_ADMIN'] },
  { value: 'REVENUE',            label: 'Revenue Report',        desc: 'Fee income by gateway and month',         roles: ['BURSAR','VC','SUPER_ADMIN'] },
  { value: 'CGPA_DISTRIBUTION',  label: 'CGPA Distribution',    desc: 'Academic classification breakdown',        roles: ['REGISTRAR','HOD','VC','SUPER_ADMIN'] },
  { value: 'RESULTS_STATISTICS', label: 'Results Statistics',   desc: 'Pass/fail rates and grade distribution',   roles: ['REGISTRAR','HOD','VC','SUPER_ADMIN'] },
  { value: 'PAYROLL_SUMMARY',    label: 'Payroll Summary',       desc: 'Payslip earnings and deductions by run',  roles: ['HR_MANAGER','BURSAR','VC','SUPER_ADMIN'] },
  { value: 'LIBRARY_USAGE',      label: 'Library Usage',         desc: 'Loan activity and overdue fines',         roles: ['REGISTRAR','SUPER_ADMIN'] },
  { value: 'CLEARANCE_STATUS',   label: 'Clearance Status',      desc: 'Graduation clearance per student/item',   roles: ['REGISTRAR','VC','SUPER_ADMIN'] },
  { value: 'STAFF_DIRECTORY',    label: 'Staff Directory',        desc: 'All staff with department and grade',     roles: ['HR_MANAGER','REGISTRAR','SUPER_ADMIN'] },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING:    'badge-warning', PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED:  'badge-success', FAILED:     'badge-danger',
};

type Tab = 'generate' | 'jobs' | 'live-enrolment' | 'live-revenue' | 'live-cgpa' | 'live-results';

export default function ReportsPage() {
  const [tab, setTab]           = useState<Tab>('generate');
  const [selectedType, setType] = useState<ReportType>('ENROLMENT');
  const [format, setFormat]     = useState<'XLSX' | 'CSV' | 'PDF'>('XLSX');
  const [dateFrom, setFrom]     = useState('');
  const [dateTo, setTo]         = useState('');
  const [page, setPage]         = useState(1);
  const [err, setErr]           = useState('');
    const [msg, setMsg]         = useState('');
  const user = useAuthStore((s) => s.user);
  const effectiveRoles = effectiveRolesOf(user);
  const canGenerate = hasEffectiveAnyRole(user, ['REGISTRAR', 'VC', 'BURSAR', 'HR_MANAGER', 'SUPER_ADMIN', 'HOD']);
  const visibleReportTypes = useMemo(
    () => REPORT_TYPES.filter((report) => report.roles.some((role) => effectiveRoles.includes(role))),
    [effectiveRoles],
  );
  const canViewEnrolment = hasEffectiveAnyRole(user, ['REGISTRAR', 'VC', 'HOD', 'SUPER_ADMIN']);
  const canViewRevenue = hasEffectiveAnyRole(user, ['BURSAR', 'VC', 'SUPER_ADMIN']);
  const canViewCgpa = hasEffectiveAnyRole(user, ['REGISTRAR', 'HOD', 'VC', 'SUPER_ADMIN']);
  const canViewResults = hasEffectiveAnyRole(user, ['REGISTRAR', 'HOD', 'VC', 'SUPER_ADMIN']);

  const { mutate: generate, isPending: generating } = useGenerateReport();
  const { data: jobData, isLoading: jobsLoading }   = useMyReportJobs(page);

  const { data: enrolment, isLoading: enrolLoading }  = useEnrolmentStats(undefined, { enabled: tab === 'live-enrolment' && canViewEnrolment });
  const { data: revenue,   isLoading: revLoading }    = useRevenueReport(undefined, { enabled: tab === 'live-revenue' && canViewRevenue });
  const { data: cgpa,      isLoading: cgpaLoading }   = useCgpaDistribution(undefined, { enabled: tab === 'live-cgpa' && canViewCgpa });
  const { data: results,   isLoading: resLoading }    = useResultsStats(undefined, { enabled: tab === 'live-results' && canViewResults });

  useEffect(() => {
    if (visibleReportTypes.length && !visibleReportTypes.some((report) => report.value === selectedType)) {
      setType(visibleReportTypes[0].value);
    }
  }, [selectedType, visibleReportTypes]);

  const jobs = jobData?.jobs ?? [];


  const handleGenerate = () => {
    if (!canGenerate || !visibleReportTypes.some((report) => report.value === selectedType)) {
      setErr('Your current authorization does not allow report generation.');
      return;
    }
    setErr(''); setMsg('');
    generate(
      { reportType: selectedType, reportFormat: format, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
      {
        onSuccess: (r) => {
          setMsg(`✓ Report job queued (ID: ${r.jobId.slice(0, 8)}…). Check the Job History tab.`);
          setTab('jobs');
        },
        onError: (e) => setErr(e.message),
      },
    );
  };

  const TABS: { k: Tab; l: string }[] = [
    ...(canGenerate ? [{ k: 'generate' as Tab, l: 'Generate Report' }] : []),
    { k: 'jobs', l: `Job History (${jobData?.total ?? 0})` },
    ...(canViewEnrolment ? [{ k: 'live-enrolment' as Tab, l: 'Enrolment' }] : []),
    ...(canViewRevenue ? [{ k: 'live-revenue' as Tab, l: 'Revenue' }] : []),
    ...(canViewCgpa ? [{ k: 'live-cgpa' as Tab, l: 'CGPA' }] : []),
    ...(canViewResults ? [{ k: 'live-results' as Tab, l: 'Results' }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Reporting & Analytics</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Large reports are generated asynchronously. Live views update every 5 minutes.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button type="button" key={t.k} onClick={() => setTab(t.k)}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === t.k ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {err && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{err}</div>}
      {msg && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}

      {/* ── Generate ─────────────────────────────────────────────────────── */}
      {tab === 'generate' && canGenerate && (
        <div className="space-y-4 max-w-2xl">
          <Card>
            <CardHeader><CardTitle className="text-sm">Configure Report</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Report Type</label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleReportTypes.map((rt) => (
                    <button type="button" key={rt.value}
                      onClick={() => setType(rt.value)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-all',
                        selectedType === rt.value
                          ? 'border-[--color-primary] bg-[--color-primary]/5 ring-1 ring-[--color-primary]'
                          : 'border-border hover:border-[--color-primary]/40',
                      )}>
                      <p className="text-xs font-semibold text-foreground">{rt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{rt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Format</label>
                  <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}
                    className="mt-1 block h-9 rounded border border-input bg-background px-3 text-sm">
                    <option value="XLSX">Excel (.xlsx)</option>
                    <option value="CSV">CSV (.csv)</option>
                    <option value="PDF">PDF (.pdf)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Date From (optional)</label>
                  <input type="date" value={dateFrom} onChange={(e) => setFrom(e.target.value)}
                    className="mt-1 block h-9 rounded border border-input bg-background px-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Date To (optional)</label>
                  <input type="date" value={dateTo} onChange={(e) => setTo(e.target.value)}
                    className="mt-1 block h-9 rounded border border-input bg-background px-3 text-sm" />
                </div>
              </div>

              <Button loading={generating} onClick={handleGenerate}>
                Generate {REPORT_TYPES.find((r) => r.value === selectedType)?.label ?? 'Report'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Reports with more than 10,000 rows are generated in the background.
                You will receive a download link when ready.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'generate' && !canGenerate && (
        <Card><CardContent className="pt-5"><p className="text-sm font-semibold">Report generation is restricted</p><p className="mt-1 text-sm text-muted-foreground">Your role can review permitted report jobs, but it cannot create new report exports.</p></CardContent></Card>
      )}

      {/* ── Job History ───────────────────────────────────────────────────── */}
      {tab === 'jobs' && (
        <div className="space-y-3">
          {jobsLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded bg-muted" />)}
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No report jobs yet. Generate a report first.</p>
          ) : (
            <>
              {jobs.map((job) => (
                <Card key={job.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[job.status] ?? '')}>
                            {job.status === 'PROCESSING' && (
                              <span className="inline-block mr-1 h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                            )}
                            {job.status}
                          </span>
                          <span className="text-sm font-semibold">
                            {job.reportType.replace(/_/g, ' ')} · {job.reportFormat}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Created: {formatDate(job.createdAt)}
                          {job.completedAt && ` · Completed: ${formatDate(job.completedAt)}`}
                          {job.totalRows !== null && ` · ${job.totalRows.toLocaleString()} rows`}
                        </p>
                        {job.status === 'FAILED' && job.errorMessage && (
                          <p className="text-xs text-[--color-danger]">Error: {job.errorMessage}</p>
                        )}
                      </div>

                      {job.status === 'COMPLETED' && job.generatedUrl && (
                        <a href={job.generatedUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-[--color-primary] px-3 py-1.5 text-xs font-medium text-[--color-primary] transition-colors hover:bg-[--color-primary] hover:text-white">
                          ⬇ Download
                          {job.urlExpiresAt && (
                            <span className="text-[10px] opacity-70">
                              · Expires {formatDate(job.urlExpiresAt)}
                            </span>
                          )}
                        </a>
                      )}

                      {(job.status === 'PENDING' || job.status === 'PROCESSING') && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[--color-primary] border-t-transparent" />
                          Processing…
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {(jobData?.totalPages ?? 1) > 1 && (
                <div className="flex justify-center gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
                  <span className="px-3 py-1.5 text-sm">{page} / {jobData?.totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= (jobData?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>Next →</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Live Enrolment ────────────────────────────────────────────────── */}
      {tab === 'live-enrolment' && (
        <div className="space-y-4">
          {enrolLoading ? (
            <div className="animate-pulse h-48 rounded bg-muted" />
          ) : enrolment ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total Students', value: enrolment.total },
                  { label: 'Active',   value: enrolment.byStatus.find((s) => s.status === 'ACTIVE')?.count ?? 0 },
                  { label: 'Graduated', value: enrolment.byStatus.find((s) => s.status === 'GRADUATED')?.count ?? 0 },
                  { label: 'Withdrawn', value: enrolment.byStatus.find((s) => s.status === 'WITHDRAWN')?.count ?? 0 },
                ].map(({ label, value }) => (
                  <Card key={label}>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold text-[--color-primary]">{value.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">{label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { title: 'By Level', data: enrolment.byLevel.map((r) => ({ label: `Level ${r.level}`, value: r.count })) },
                  { title: 'By Gender', data: enrolment.byGender.map((r) => ({ label: r.gender, value: r.count })) },
                  { title: 'By Mode',  data: enrolment.byMode.map((r)  => ({ label: r.mode.replace('_',' '), value: r.count })) },
                ].map(({ title, data }) => (
                  <Card key={title}>
                    <CardHeader><CardTitle className="text-xs">{title}</CardTitle></CardHeader>
                    <CardContent className="space-y-1.5">
                      {data.map(({ label, value }) => (
                        <div key={label} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-semibold">{value.toLocaleString()}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Live Revenue ──────────────────────────────────────────────────── */}
      {tab === 'live-revenue' && (
        <div className="space-y-4">
          {revLoading ? <div className="animate-pulse h-48 rounded bg-muted" /> : revenue ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-[--color-primary]">₦{parseFloat(String(revenue.totalRevenue)).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Collected</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-[--color-primary]">{revenue.totalTransactions.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Transactions</p>
                </CardContent></Card>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-xs">By Gateway</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {revenue.byGateway.map((g) => (
                      <div key={g.gateway} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{g.gateway}</span>
                        <div className="text-right">
                          <p className="font-semibold">₦{parseFloat(String(g.total)).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">{g.count} transactions</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-xs">Monthly Trend (last 12)</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {revenue.byMonth.slice(0, 12).map((m) => (
                      <div key={m.month} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{m.month}</span>
                        <span className="font-mono font-semibold">₦{m.total.toLocaleString()}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Live CGPA ─────────────────────────────────────────────────────── */}
      {tab === 'live-cgpa' && (
        <div className="space-y-4">
          {cgpaLoading ? <div className="animate-pulse h-48 rounded bg-muted" /> : cgpa ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total Students', value: cgpa.totalStudents.toLocaleString() },
                  { label: 'Average CGPA',   value: parseFloat(String(cgpa.averageCgpa)).toFixed(2) },
                  { label: 'Highest CGPA',   value: parseFloat(String(cgpa.maxCgpa)).toFixed(2) },
                  { label: 'Lowest CGPA',    value: parseFloat(String(cgpa.minCgpa)).toFixed(2) },
                ].map(({ label, value }) => (
                  <Card key={label}><CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-[--color-primary]">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </CardContent></Card>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm">Classification Distribution</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {cgpa.distribution.map((d) => {
                    const pct = cgpa.totalStudents > 0 ? (d.count / cgpa.totalStudents) * 100 : 0;
                    const barColor =
                      d.classification === 'First Class'            ? 'bg-amber-500' :
                      d.classification === 'Second Class (Upper)'   ? 'bg-[--color-success]' :
                      d.classification === 'Second Class (Lower)'   ? 'bg-blue-500' :
                      d.classification === 'Third Class'            ? 'bg-orange-400' :
                      d.classification === 'Pass'                   ? 'bg-yellow-400' : 'bg-red-400';
                    return (
                      <div key={d.classification}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium">{d.classification}</span>
                          <span className="text-muted-foreground">{d.count.toLocaleString()} ({pct.toFixed(1)}%) · avg {d.avgCgpa.toFixed(2)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}

      {/* ── Live Results ──────────────────────────────────────────────────── */}
      {tab === 'live-results' && (
        <div className="space-y-4">
          {resLoading ? <div className="animate-pulse h-48 rounded bg-muted" /> : results ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total Results',   value: results.totalResults.toLocaleString() },
                  { label: 'Pass',            value: results.passCount.toLocaleString() },
                  { label: 'Fail',            value: results.failCount.toLocaleString() },
                  { label: 'Pass Rate',       value: `${results.passRate}%` },
                ].map(({ label, value }) => (
                  <Card key={label}><CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-[--color-primary]">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </CardContent></Card>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-xs">Grade Distribution</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {['A','B','C','D','E','F'].map((g) => {
                      const row = results.byGrade.find((r) => r.grade === g);
                      const count = row?.count ?? 0;
                      const pct   = results.totalResults > 0 ? (count / results.totalResults) * 100 : 0;
                      return (
                        <div key={g}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-mono font-bold">{g}</span>
                            <span className="text-muted-foreground">{count.toLocaleString()} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={cn('h-full rounded-full', g === 'F' ? 'bg-red-500' : 'bg-[--color-primary]')}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-xs">Score Statistics</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: 'Average Score', value: parseFloat(String(results.averageScore)).toFixed(1) },
                      { label: 'Average GP',    value: parseFloat(String(results.averageGp)).toFixed(2) },
                      { label: 'Minimum Score', value: results.minScore },
                      { label: 'Maximum Score', value: results.maxScore },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold font-mono">{value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
