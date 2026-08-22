'use client';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAnalyticsDashboard, useHodDashboard, useAuditSummary,
} from '@/hooks/use-reports';
import { useDataQualitySummary } from '@/hooks/use-intelligence';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import { effectiveRolesOf, hasEffectiveRole } from '@/lib/authz';
import { DataFreshness } from '@/components/dashboard/dashboard-primitives';

// ── Sparkline bar visualisation ───────────────────────────────────────────────
function MiniBar({ value, max, color = 'bg-[--color-primary]' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-mono text-muted-foreground">{value.toLocaleString()}</span>
    </div>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
function KpiTile({
  label, value, sub, trend, color = 'text-[--color-primary]',
}: {
  label: string; value: string | number; sub?: string; trend?: 'up' | 'down' | 'neutral'; color?: string;
}) {
  return (
    <Card className="erp-data-surface">
      <CardContent className="pt-5 pb-4">
        <p className={cn('text-3xl font-bold tracking-tight', color)}>{value}</p>
        <p className="mt-1 text-xs font-medium text-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        {trend && (
          <div className={cn('mt-1 flex items-center gap-1 text-xs',
            trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-[--color-danger]' : 'text-muted-foreground')}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type DashTab = 'overview' | 'hod' | 'audit' | 'quality';

export default function AnalyticsPage() {
  const user   = useAuthStore((s) => s.user);
  const role = effectiveRolesOf(user)[0] ?? '';
  const deptId = user?.staffScope?.deptId;

  const isAdmin = hasEffectiveRole(user, 'VC', 'SUPER_ADMIN');
  const isHod = hasEffectiveRole(user, 'HOD');

  const defaultTab: DashTab = isAdmin ? 'overview' : 'hod';
  const [tab, setTab] = useState<DashTab>(defaultTab);

  const { data: kpi, isLoading: kpiLoading } = useAnalyticsDashboard(undefined, { enabled: isAdmin });
  const { data: hod, isLoading: hodLoading } = useHodDashboard(isHod ? deptId : undefined, { enabled: isAdmin || isHod });
  const { data: audit, isLoading: auditLoading } = useAuditSummary({ enabled: isAdmin });
  const { data: quality, isLoading: qualityLoading } = useDataQualitySummary({ enabled: isAdmin });

  const tabs: { k: DashTab; l: string; show: boolean }[] = [
    { k: 'overview', l: 'Institution Overview', show: isAdmin },
    { k: 'hod',      l: 'Department Dashboard',  show: isAdmin || isHod },
    { k: 'audit',    l: 'Audit Summary',          show: isAdmin },
    { k: 'quality',  l: 'Data Quality',           show: isAdmin },
  ];

  const visibleTabs = tabs.filter((t) => t.show);

  if (!isAdmin && !isHod) {
    return <Card><CardHeader><CardTitle>Analytics access</CardTitle><CardDescription>Your current effective role does not include an analytics workspace. Contact an authorized administrator if you believe this is incorrect.</CardDescription></CardHeader></Card>;
  }

  const totalStudents  = kpi?.students.total ?? 0;
  const activeStudents = kpi?.students.byStatus.find((s) => s.status === 'ACTIVE')?.count ?? 0;
  const dashboardLoading = kpiLoading || hodLoading || auditLoading || qualityLoading;

  return (
    <div className="erp-workspace-page space-y-4">
      {/* Header */}
      <div className="erp-page-header glass-accent rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="enterprise-eyebrow">Decision workspace</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">Analytics Dashboard</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {kpi?.academicCalendar
                ? `Academic Year ${kpi.academicCalendar.academicYear} · Status: ${kpi.academicCalendar.status}`
                : 'No active academic calendar'}
              {' '}&nbsp;·&nbsp; Refreshes every 5 min
            </p>
          </div>

          {visibleTabs.length > 1 && (
            <div className="erp-control-rail flex gap-2 flex-wrap rounded-xl border p-2">
              {visibleTabs.map((t) => (
                <button key={t.k} type="button" onClick={() => setTab(t.k)}
                  className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    tab === t.k ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                  {t.l}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <DataFreshness
            status={dashboardLoading ? 'loading' : 'verified'}
            label={dashboardLoading ? 'Refreshing authorized analytics' : 'Verified analytics data'}
            detail="Analytics refreshes every five minutes. Sensitive views remain filtered by your effective role and department scope."
          />
          <span className="rounded-full border border-border bg-card/70 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
            Effective view: {role ? role.replace(/_/g, ' ') : 'Authorized role'}
          </span>
        </div>
      </div>

      {/* ── Institution Overview (VC / super_admin) ───────────────────────── */}
      {tab === 'overview' && (
        <>
          {kpiLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[1,2,3,4,5,6,7,8].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : kpi ? (
            <div className="space-y-6">
              {/* Top KPIs */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiTile
                  label="Total Students"
                  value={totalStudents.toLocaleString()}
                  sub={`${activeStudents.toLocaleString()} active`}
                />
                <KpiTile
                  label="Fee Collection Rate"
                  value={kpi.fees.collectionRate}
                  sub={`₦${parseFloat(String(kpi.fees.totalCollected)).toLocaleString()} of ₦${parseFloat(String(kpi.fees.totalInvoiced)).toLocaleString()}`}
                  color={parseFloat(kpi.fees.collectionRate) >= 80 ? 'text-green-600' : 'text-[--color-warning]'}
                />
                <KpiTile
                  label="Results Pending"
                  value={kpi.results.pendingPublication.toLocaleString()}
                  sub="awaiting senate publication"
                  color={kpi.results.pendingPublication > 50 ? 'text-[--color-warning]' : 'text-[--color-primary]'}
                />
                <KpiTile
                  label="Clearance Rate"
                  value={kpi.clearance.completionRate}
                  sub={`${kpi.clearance.cleared.toLocaleString()} cleared of ${kpi.clearance.total.toLocaleString()}`}
                  color={parseFloat(kpi.clearance.completionRate) >= 70 ? 'text-green-600' : 'text-[--color-warning]'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiTile
                  label="Total Staff"
                  value={kpi.staff.total.toLocaleString()}
                  sub={`${kpi.staff.byStatus.find((s) => s.status === 'ACTIVE')?.count ?? 0} active`}
                />
                <KpiTile
                  label="Active Payroll Runs"
                  value={kpi.payroll.activeRuns}
                  sub="pending approval or disbursement"
                  color={kpi.payroll.activeRuns > 0 ? 'text-amber-600' : 'text-[--color-primary]'}
                />
                <KpiTile
                  label="Last 7 Days Payments"
                  value={`₦${parseFloat(String(kpi.fees.last7DaysAmount)).toLocaleString()}`}
                  sub={`${kpi.fees.last7DaysCount} transactions`}
                />
                <KpiTile
                  label="Invoices Issued"
                  value={kpi.fees.invoiceCount.toLocaleString()}
                  sub="total fee invoices"
                />
              </div>

              {/* Student status breakdown */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader><CardTitle className="text-xs">Students by Status</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {kpi.students.byStatus
                      .sort((a, b) => b.count - a.count)
                      .map((s) => (
                        <div key={s.status}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">{s.status}</span>
                          </div>
                          <MiniBar value={s.count} max={totalStudents}
                            color={s.status === 'ACTIVE' ? 'bg-green-500' : s.status === 'GRADUATED' ? 'bg-blue-500' : 'bg-muted-foreground'} />
                        </div>
                      ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-xs">Staff by Status</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {kpi.staff.byStatus
                      .sort((a, b) => b.count - a.count)
                      .map((s) => (
                        <div key={s.status}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">{s.status}</span>
                          </div>
                          <MiniBar value={s.count} max={kpi.staff.total}
                            color={s.status === 'ACTIVE' ? 'bg-green-500' : 'bg-muted-foreground'} />
                        </div>
                      ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-xs">Admissions Pipeline</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(() => {
                      const total = kpi.admissions.byStatus.reduce((s, r) => s + r.count, 0);
                      return kpi.admissions.byStatus
                        .sort((a, b) => b.count - a.count)
                        .map((s) => (
                          <div key={s.status}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">{s.status}</span>
                            </div>
                            <MiniBar value={s.count} max={total}
                              color={
                                s.status === 'MATRICULATED' ? 'bg-green-500' :
                                s.status === 'ACCEPTED'     ? 'bg-blue-500'  :
                                s.status === 'OFFERED'      ? 'bg-amber-500' : 'bg-muted-foreground'
                              } />
                          </div>
                        ));
                    })()}
                  </CardContent>
                </Card>
              </div>

              {/* Fee collection progress bar */}
              <Card>
                <CardHeader><CardTitle className="text-xs">Fee Collection Progress</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        ₦{parseFloat(String(kpi.fees.totalCollected)).toLocaleString()} collected
                      </span>
                      <span className="text-muted-foreground">
                        Target: ₦{parseFloat(String(kpi.fees.totalInvoiced)).toLocaleString()}
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all',
                          parseFloat(kpi.fees.collectionRate) >= 80 ? 'bg-green-500' :
                          parseFloat(kpi.fees.collectionRate) >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: kpi.fees.collectionRate }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{kpi.fees.collectionRate} of target collected</span>
                      <span>Outstanding: ₦{(parseFloat(String(kpi.fees.totalInvoiced)) - parseFloat(String(kpi.fees.totalCollected))).toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No analytics data available.</p>
          )}
        </>
      )}

      {/* ── HOD Department Dashboard ──────────────────────────────────────── */}
      {tab === 'hod' && (
        <>
          {hodLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[1,2,3,4].map((i) => <div key={i} className="h-28 rounded-lg bg-muted" />)}
              </div>
            </div>
          ) : hod ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiTile label="Active Students"   value={hod.totalActiveStudents.toLocaleString()} />
                <KpiTile label="Pending Results"   value={hod.resultsAwaitingHodApproval.toLocaleString()}
                  color={hod.resultsAwaitingHodApproval > 0 ? 'text-amber-600' : 'text-green-600'}
                  sub={hod.resultsAwaitingHodApproval > 0 ? 'awaiting your approval' : 'none pending'} />
                <KpiTile label="Active Courses"    value={hod.totalCourses.toLocaleString()} />
                <KpiTile label="Active Staff"      value={hod.totalActiveStaff.toLocaleString()} />
              </div>

              {hod.resultsAwaitingHodApproval > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  ⚠ {hod.resultsAwaitingHodApproval} result sheet(s) are awaiting your HOD approval.
                  Go to <strong>Results</strong> → <strong>HOD Approval</strong> to review.
                </div>
              )}

              <Card>
                <CardHeader><CardTitle className="text-sm">Student CGPA Distribution</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {hod.cgpaDistribution.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No published results yet for CGPA computation.</p>
                  ) : (
                    (() => {
                      const maxCount = Math.max(...hod.cgpaDistribution.map((d) => d.count), 1);
                      const colorMap: Record<string, string> = {
                        'First Class':           'bg-amber-500',
                        'Second Class (Upper)':  'bg-green-500',
                        'Second Class (Lower)':  'bg-blue-500',
                        'Third Class':           'bg-orange-400',
                        'Pass':                  'bg-yellow-400',
                        'Fail / No Results':     'bg-red-400',
                      };
                      return hod.cgpaDistribution.map((d) => (
                        <div key={d.classification}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-foreground">{d.classification}</span>
                          </div>
                          <MiniBar
                            value={d.count}
                            max={maxCount}
                            color={colorMap[d.classification] ?? 'bg-muted-foreground'}
                          />
                        </div>
                      ));
                    })()
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isHod
                ? 'No department data found. Ensure your user is linked to a department.'
                : 'Select a department from the HOD dropdown to view its dashboard.'}
            </p>
          )}
        </>
      )}

      {/* ── Data Quality (super_admin) ─────────────────────────────────────── */}
      {tab === 'quality' && (
        <>
          {qualityLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded bg-muted" />)}
              </div>
              <div className="h-64 rounded bg-muted" />
            </div>
          ) : quality ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiTile
                  label="Foundation status"
                  value={quality.status}
                  sub="deterministic readiness checks"
                  color={quality.status === 'HEALTHY' ? 'text-green-600' : quality.status === 'CRITICAL' ? 'text-[--color-danger]' : 'text-[--color-warning]'}
                />
                <KpiTile label="Checks" value={quality.totals.checks} sub="tracked data domains" />
                <KpiTile label="Needs attention" value={quality.totals.attention} sub="human review recommended" color={quality.totals.attention ? 'text-[--color-warning]' : 'text-green-600'} />
                <KpiTile label="Critical" value={quality.totals.critical} sub="blocking readiness checks" color={quality.totals.critical ? 'text-[--color-danger]' : 'text-green-600'} />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Data readiness checks</CardTitle>
                  <CardDescription>Counts are read-only and support investigation; they do not modify institutional records.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {quality.checks.map((check) => (
                    <div key={check.code} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{check.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{check.domain.replaceAll('_', ' ')}</p>
                        </div>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', check.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : check.severity === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
                          {check.severity}
                        </span>
                      </div>
                      <p className="mt-3 text-2xl font-semibold">{check.count.toLocaleString()}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.message}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Data quality information is unavailable.</p>
          )}
        </>
      )}

      {/* ── Audit Summary (super_admin) ───────────────────────────────────── */}
      {tab === 'audit' && (
        <>
          {auditLoading ? (
            <div className="animate-pulse h-64 rounded bg-muted" />
          ) : audit ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <KpiTile
                  label="Audit Events (30 days)"
                  value={audit.totalLast30Days.toLocaleString()}
                />
                <KpiTile
                  label="Login Events (30 days)"
                  value={audit.recentLogins.toLocaleString()}
                />
                <KpiTile
                  label="Distinct Action Types"
                  value={audit.byAction.length}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-xs">Top Action Types (30 days)</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(() => {
                      const maxCount = Math.max(...audit.byAction.map((a) => a.count), 1);
                      return audit.byAction.slice(0, 8).map((a) => (
                        <div key={a.action}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-mono text-muted-foreground">{a.action}</span>
                          </div>
                          <MiniBar value={a.count} max={maxCount} />
                        </div>
                      ));
                    })()}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-xs">Most Audited Tables (30 days)</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(() => {
                      const maxCount = Math.max(...audit.topTables.map((t) => t.count), 1);
                      return audit.topTables.map((t) => (
                        <div key={t.table}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-mono text-muted-foreground">{t.table}</span>
                          </div>
                          <MiniBar value={t.count} max={maxCount} color="bg-[--color-accent]" />
                        </div>
                      ));
                    })()}
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <a href="/dashboard/audit-logs"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[--color-primary] hover:text-[--color-primary]">
                  View full audit log →
                </a>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
