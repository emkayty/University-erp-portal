import {
  Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe,
  ParseUUIDPipe, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles, SelfScoped } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '@uniportal/types';
import { ReportsService } from './reports.service';
import { ReportArtifactService } from './services/report-artifact.service';
import type {
  AnalyticsQueryDto, CgpaDistributionQueryDto, EnrolmentQueryDto,
  GenerateReportDto, ResultsStatsQueryDto, RevenueQueryDto,
} from './dto/reports.dto';

@UseGuards(RolesGuard)
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly artifacts: ReportArtifactService) {}

  // ── Async report generation ───────────────────────────────────────────────

  /**
   * POST /api/v1/reports/generate
   * Enqueues a BullMQ async report job. Returns { jobId, status }.
   * Client polls GET /reports/jobs/:id until status = COMPLETED.
   */
  @Roles('REGISTRAR', 'VC', 'BURSAR', 'HR_MANAGER', 'SUPER_ADMIN', 'HOD')
  @Post('generate')
  generateReport(@Body() dto: GenerateReportDto, @CurrentUser() user: JwtPayload) {
    return this.reports.generateReport(dto, user);
  }

  /**
   * GET /api/v1/reports/jobs
   * List the current user's report jobs (most recent first).
   */
  @SelfScoped()
  @Get('jobs')
  getMyJobs(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.reports.getUserJobs(user.sub, page, pageSize);
  }

  /**
   * GET /api/v1/reports/jobs/:id
   * Poll a single job for status + download URL.
   */
  @SelfScoped()
  @Get('jobs/:id')
  getJobStatus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.reports.getJobStatus(id, user.sub);
  }

  @SelfScoped()
  @Get('jobs/:id/download')
  async downloadReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: import('express').Response,
  ) {
    const job = await this.reports.getJobStatus(id, user.sub);
    if (job.status !== 'COMPLETED') {
      return res.status(409).json({ success: false, error: { code: 'REPORT_NOT_READY', message: 'Report is not ready for download' } });
    }
    if (process.env.S3_REPORTS_BUCKET && job.generatedUrl) return res.redirect(302, job.generatedUrl);
    const buffer = await this.artifacts.readLocal(id, job.reportFormat);
    const types: Record<string, string> = { CSV: 'text/csv; charset=utf-8', XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', PDF: 'application/pdf' };
    res.setHeader('Content-Type', types[job.reportFormat] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="uniportal-report-${id}.${job.reportFormat.toLowerCase()}"`);
    return res.send(buffer);
  }

  // ── Live synchronous reports (served from read replica) ───────────────────

  /**
   * GET /api/v1/reports/enrolment
   * Live enrolment breakdown by status, level, gender, mode.
   */
  @Roles('REGISTRAR', 'VC', 'HOD', 'SUPER_ADMIN')
  @Get('enrolment')
  getEnrolment(@Query() query: EnrolmentQueryDto) {
    return this.reports.getEnrolmentStats(query);
  }

  /**
   * GET /api/v1/reports/revenue
   * Revenue summary by gateway and month.
   */
  @Roles('BURSAR', 'VC', 'SUPER_ADMIN')
  @Get('revenue')
  getRevenue(@Query() query: RevenueQueryDto) {
    return this.reports.getRevenueReport(query);
  }

  /**
   * GET /api/v1/reports/cgpa-distribution
   * CGPA classification distribution across students.
   */
  @Roles('REGISTRAR', 'HOD', 'VC', 'SUPER_ADMIN')
  @Get('cgpa-distribution')
  getCgpaDistribution(@Query() query: CgpaDistributionQueryDto) {
    return this.reports.getCgpaDistribution(query);
  }

  /**
   * GET /api/v1/reports/results-statistics
   * Published result pass/fail rates and grade distribution.
   */
  @Roles('REGISTRAR', 'HOD', 'VC', 'SUPER_ADMIN')
  @Get('results-statistics')
  getResultsStats(@Query() query: ResultsStatsQueryDto) {
    return this.reports.getResultsStats(query);
  }

  // ── Analytics dashboards ──────────────────────────────────────────────────

  /**
   * GET /api/v1/reports/analytics/dashboard
   * Full KPI snapshot for VC / super_admin dashboard.
   */
  @Roles('VC', 'SUPER_ADMIN')
  @Get('analytics/dashboard')
  getAnalyticsDashboard(@Query() query: AnalyticsQueryDto) {
    return this.reports.getAnalyticsDashboard(query);
  }

  /**
   * GET /api/v1/reports/analytics/my-dashboard
   * Role-aware dashboard snapshot. The service applies the user's role and
   * organizational scope server-side; the client never supplies a scope.
   */
  @Roles('VC','REGISTRAR','DEAN','HOD','BURSAR','HR_MANAGER','SUPPORT_STAFF','STAFF','STUDENT','SUPER_ADMIN')
  @Get('analytics/my-dashboard')
  getMyDashboard(@CurrentUser() user: JwtPayload) {
    return this.reports.getMyDashboard(user);
  }

  /**
   * GET /api/v1/reports/analytics/hod
   * Department-scoped dashboard for HOD.
   * departmentId is extracted from the HOD's JWT staffScope.deptId.
   */
  @Roles('HOD','SUPER_ADMIN')
  @Get('analytics/hod')
  getHodDashboard(@CurrentUser() user: JwtPayload) {
    const deptId = user.staffScope?.deptId ?? '';
    return this.reports.getHodDashboard(deptId);
  }

  /**
   * GET /api/v1/reports/analytics/hod/:departmentId
   * HOD dashboard for a specific department (registrar/VC override).
   */
  @Roles('REGISTRAR', 'VC', 'SUPER_ADMIN')
  @Get('analytics/hod/:departmentId')
  getHodDashboardById(@Param('departmentId', ParseUUIDPipe) id: string) {
    return this.reports.getHodDashboard(id);
  }

  /**
   * GET /api/v1/reports/analytics/student/:studentId
   * Self-service dashboard — CGPA, clearance checklist, outstanding fees, loans.
   * Deep-audit fix (Aug 2026): STUDENT role could previously view ANY
   * student's dashboard by ID, not just their own — @Roles('STUDENT', ...,'SUPER_ADMIN')
   * only checks role membership, never ownership. Self-vs-staff ownership
   * is now enforced in ReportsService.getStudentDashboard() itself, where
   * the Student row is already being fetched.
   */
  @Roles('STUDENT', 'REGISTRAR', 'SUPER_ADMIN')
  @Get('analytics/student/:studentId')
  getStudentDashboard(@Param('studentId', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.reports.getStudentDashboard(id, user);
  }
}
