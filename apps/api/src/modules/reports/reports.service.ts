import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, ReportFormat, ReportStatus, ReportType } from '@prisma/client';
import type { JwtPayload } from '@uniportal/types';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../database/prisma.service';
import { evaluateAdministrativeClearance } from '../clearance/clearance-evaluator';
import type {
  AnalyticsQueryDto, AuditLogQueryDto, CgpaDistributionQueryDto,
  EnrolmentQueryDto, GenerateReportDto, ResultsStatsQueryDto, RevenueQueryDto,
} from './dto/reports.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ── Async Report Generation ───────────────────────────────────────────────

  /**
   * Enqueues a BullMQ job and creates a ReportJob record.
   * Returns immediately with jobId — client polls /jobs/:id for status.
   */
  async generateReport(dto: GenerateReportDto, actor: JwtPayload) {
    const safeDto = this.authorizeReportRequest(dto, actor);
    const triggeredBy = actor.sub;
    const parameters = {
      dateFrom: safeDto.dateFrom,
      dateTo: safeDto.dateTo,
      departmentId: safeDto.departmentId,
      facultyId: safeDto.facultyId,
      programmeId: safeDto.programmeId,
      academicYear: safeDto.academicYear,
      semester: safeDto.semester,
    };
    const { job, eventId } = await this.prisma.$transaction(async (tx) => {
      const job = await tx.reportJob.create({
        data: {
          reportType: safeDto.reportType,
          reportFormat: safeDto.reportFormat,
          status: ReportStatus.PENDING,
          parameters,
          triggeredBy,
        },
      });
      const eventId = await this.outbox.write(tx, 'report.generate_requested', {
        reportJobId: job.id,
        reportType: safeDto.reportType,
        reportFormat: safeDto.reportFormat,
        triggeredBy,
        parameters,
      });
      return { job, eventId };
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'report_jobs', targetId: job.id,
      newValues: { reportType: safeDto.reportType, reportFormat: safeDto.reportFormat, eventId },
    }, triggeredBy);

    this.logger.log(`Report job recorded for durable dispatch: ${job.id} (${safeDto.reportType}, event ${eventId})`);
    return { jobId: job.id, status: job.status, reportType: job.reportType };
  }

  async getJobStatus(jobId: string, requestingUserId: string) {
    const job = await this.prisma.reportJob.findUniqueOrThrow({ where: { id: jobId } });

    // Users can only see their own jobs (super_admin can see all — enforced in controller)
    if (job.triggeredBy !== requestingUserId) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'Report job not found' });
    }

    return job;
  }

  async getUserJobs(userId: string, page = 1, pageSize = 20) {
    const [jobs, total] = await Promise.all([
      this.prisma.reportJob.findMany({
        where:   { triggeredBy: userId },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
        select: {
          id: true, reportType: true, reportFormat: true, status: true,
          totalRows: true, generatedUrl: true, urlExpiresAt: true,
          errorMessage: true, createdAt: true, completedAt: true,
        },
      }),
      this.prisma.reportJob.count({ where: { triggeredBy: userId } }),
    ]);
    return { jobs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  private authorizeReportRequest(dto: GenerateReportDto, actor: JwtPayload): GenerateReportDto {
    const allowedByRole: Record<string, ReportType[]> = {
      HOD: [ReportType.ENROLMENT, ReportType.CGPA_DISTRIBUTION, ReportType.RESULTS_STATISTICS],
      BURSAR: [ReportType.REVENUE, ReportType.CLEARANCE_STATUS],
      HR_MANAGER: [ReportType.PAYROLL_SUMMARY, ReportType.STAFF_DIRECTORY],
      REGISTRAR: [ReportType.ENROLMENT, ReportType.CGPA_DISTRIBUTION, ReportType.RESULTS_STATISTICS, ReportType.CLEARANCE_STATUS, ReportType.LIBRARY_USAGE, ReportType.STAFF_DIRECTORY],
      VC: Object.values(ReportType).filter((type) => type !== ReportType.AUDIT_EXPORT),
      SUPER_ADMIN: Object.values(ReportType).filter((type) => type !== ReportType.AUDIT_EXPORT),
    };
    const allowed = allowedByRole[actor.role] ?? [];
    if (!allowed.includes(dto.reportType)) {
      throw new ForbiddenException({
        code: 'RBAC_FORBIDDEN',
        message: `Role ${actor.role} cannot generate ${dto.reportType} reports`,
      });
    }
    if (dto.reportType === ReportType.CUSTOM || dto.reportType === ReportType.AUDIT_EXPORT) {
      throw new BadRequestException({
        code: 'REPORT_TYPE_NOT_SUPPORTED',
        message: 'This report type is not available through the general report queue.',
      });
    }

    if (actor.role === 'HOD') {
      const departmentId = actor.staffScope?.deptId;
      if (!departmentId) {
        throw new ForbiddenException({ code: 'RBAC_SCOPE_FORBIDDEN', message: 'HOD report access requires a department scope' });
      }
      return { ...dto, departmentId, facultyId: undefined, programmeId: undefined };
    }
    return dto;
  }

  // ── Live Enrolment Report ─────────────────────────────────────────────────

  async getEnrolmentStats(query: EnrolmentQueryDto) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.academicYear) where['entryAcademicYear'] = query.academicYear;
    if (query.programmeId)  where['programmeId']       = query.programmeId;
    if (query.departmentId) where['departmentId']       = query.departmentId;
    if (query.facultyId)    where['facultyId']          = query.facultyId;
    if (query.level)        where['level']              = query.level;

    const [byStatus, byLevel, byGender, byMode, total] = await Promise.all([
      // Breakdown by student status
      this.prisma.student.groupBy({
        by:    ['status'],
        where: where as Prisma.StudentWhereInput,
        _count: { status: true },
      }),
      // Breakdown by academic level
      this.prisma.student.groupBy({
        by:    ['level'],
        where: where as Prisma.StudentWhereInput,
        _count: { level: true },
        orderBy: { level: 'asc' },
      }),
      // Breakdown by gender
      this.prisma.student.groupBy({
        by:    ['gender'],
        where: where as Prisma.StudentWhereInput,
        _count: { gender: true },
      }),
      // Breakdown by mode of study
      this.prisma.student.groupBy({
        by:    ['modeOfStudy'],
        where: where as Prisma.StudentWhereInput,
        _count: { modeOfStudy: true },
      }),
      this.prisma.student.count({
        where: where as Prisma.StudentWhereInput,
      }),
    ]);

    return {
      total,
      byStatus:  byStatus.map((r)  => ({ status: r.status,         count: r._count.status })),
      byLevel:   byLevel.map((r)   => ({ level: r.level,           count: r._count.level })),
      byGender:  byGender.map((r)  => ({ gender: r.gender,         count: r._count.gender })),
      byMode:    byMode.map((r)    => ({ mode: r.modeOfStudy,      count: r._count.modeOfStudy })),
    };
  }

  // ── Live Revenue Report ───────────────────────────────────────────────────

  async getRevenueReport(query: RevenueQueryDto) {
    const where: Record<string, unknown> = { status: 'SUCCESS' };
    if (query.gateway)  where['provider'] = query.gateway;
    if (query.academicYear || query.programmeId) {
      where['studentFee'] = {
        ...(query.academicYear ? { academicYear: query.academicYear } : {}),
        ...(query.programmeId ? { feeSchedule: { programmeId: query.programmeId } } : {}),
      };
    }
    if (query.dateFrom || query.dateTo) {
      where['createdAt'] = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo   ? { lte: new Date(query.dateTo) }   : {}),
      };
    }

    const [byGateway, aggregate, byMonth] = await Promise.all([
      this.prisma.payment.groupBy({
        by:     ['provider'],
        where:  where as Prisma.PaymentWhereInput,
        _sum:   { amount: true },
        _count: { id:     true },
      }),
      this.prisma.payment.aggregate({
        where: where as Prisma.PaymentWhereInput,
        _sum:  { amount: true },
        _count: { id: true },
      }),
      // Monthly revenue breakdown using raw SQL
      this.prisma.$queryRaw<{ month: string; total: string; count: bigint }[]>`
        SELECT
          TO_CHAR("createdAt", 'YYYY-MM') AS month,
          SUM(amount)::TEXT              AS total,
          COUNT(*)                       AS count
        FROM payments
        WHERE status = 'SUCCESS'
          ${query.dateFrom ? this.prisma.$queryRaw`AND "createdAt" >= ${new Date(query.dateFrom)}` : this.prisma.$queryRaw``}
          ${query.dateTo ? this.prisma.$queryRaw`AND "createdAt" <= ${new Date(query.dateTo)}` : this.prisma.$queryRaw``}
        GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 24
      `,
    ]);

    return {
      totalRevenue:    aggregate._sum.amount ?? 0,
      totalTransactions: aggregate._count.id,
      byGateway: byGateway.map((r) => ({
        gateway: r.provider,
        total:   r._sum.amount ?? 0,
        count:   r._count.id,
      })),
      byMonth: byMonth.map((r) => ({
        month: r.month,
        total: parseFloat(r.total ?? '0'),
        count: Number(r.count),
      })),
    };
  }

  // ── CGPA Distribution ─────────────────────────────────────────────────────

  async getCgpaDistribution(query: CgpaDistributionQueryDto) {
    const where: Record<string, unknown> = { deletedAt: null, status: 'ACTIVE' };
    if (query.departmentId || query.facultyId) where['department'] = {
      ...(query.departmentId ? { id: query.departmentId } : {}),
      ...(query.facultyId ? { facultyId: query.facultyId } : {}),
    };

    // Use raw SQL to bucket CGPA into classification bands
    const buckets = await this.prisma.$queryRaw<{
      classification: string; count: bigint; avg_cgpa: string;
    }[]>`
      SELECT
        CASE
          WHEN cgpa >= 4.50 THEN 'First Class'
          WHEN cgpa >= 3.50 THEN 'Second Class (Upper)'
          WHEN cgpa >= 2.40 THEN 'Second Class (Lower)'
          WHEN cgpa >= 1.50 THEN 'Third Class'
          WHEN cgpa >= 1.00 THEN 'Pass'
          ELSE 'Fail'
        END                    AS classification,
        COUNT(*)               AS count,
        AVG(cgpa)::TEXT        AS avg_cgpa
      FROM students
      WHERE "deletedAt" IS NULL
        AND status = 'ACTIVE'
        ${query.departmentId ? this.prisma.$queryRaw`AND "departmentId" = ${query.departmentId}::UUID` : this.prisma.$queryRaw``}
      GROUP BY classification
      ORDER BY MIN(cgpa) DESC
    `;

    const aggregate = await this.prisma.student.aggregate({
      where: where as Prisma.StudentWhereInput,
      _avg:  { cgpa: true },
      _min:  { cgpa: true },
      _max:  { cgpa: true },
      _count: { id: true },
    });

    return {
      totalStudents:  aggregate._count.id,
      averageCgpa:    aggregate._avg.cgpa ?? 0,
      minCgpa:        aggregate._min.cgpa ?? 0,
      maxCgpa:        aggregate._max.cgpa ?? 0,
      distribution: buckets.map((b) => ({
        classification: b.classification,
        count:          Number(b.count),
        avgCgpa:        parseFloat(b.avg_cgpa ?? '0'),
      })),
    };
  }

  // ── Results Statistics ────────────────────────────────────────────────────

  async getResultsStats(query: ResultsStatsQueryDto) {
    const where: Record<string, unknown> = { status: 'SENATE_PUBLISHED' };
    if (query.academicYear || query.semester) {
      const semester: Record<string, unknown> = {};
      if (query.academicYear) semester.academicYear = query.academicYear;
      if (query.semester) {
        const term = query.semester.toUpperCase();
        const semesterNumber = term === 'FIRST' ? 1 : term === 'SECOND' ? 2 : term === 'SUMMER' ? 3 : Number(term);
        if (!Number.isInteger(semesterNumber) || semesterNumber < 1) throw new BadRequestException('Invalid semester filter');
        semester.semesterNumber = semesterNumber;
      }
      where['semester'] = semester;
    }
    if (query.departmentId) where['courseOffering'] = { course: { departmentId: query.departmentId } };
    if (query.courseOfferingId)  where['courseOfferingId']  = query.courseOfferingId;

    const [byGrade, aggregate, passRate] = await Promise.all([
      this.prisma.studentResult.groupBy({
        by:     ['grade'],
        where:  where as Prisma.StudentResultWhereInput,
        _count: { grade: true },
        orderBy: { grade: 'asc' },
      }),
      this.prisma.studentResult.aggregate({
        where: where as Prisma.StudentResultWhereInput,
        _avg:  { score: true, gradePoint: true },
        _count: { id: true },
        _min:  { score: true },
        _max:  { score: true },
      }),
      // Pass/fail counts (grade F = fail)
      this.prisma.studentResult.groupBy({
        by:    ['grade'],
        where: {
          ...(where as Prisma.StudentResultWhereInput),
          grade: { in: ['A', 'B', 'C', 'D', 'E', 'F'] },
        },
        _count: { grade: true },
      }),
    ]);

    const totalResults = aggregate._count.id;
    const failCount    = passRate.find((r) => r.grade === 'F')?._count.grade ?? 0;
    const passCount    = totalResults - failCount;

    return {
      totalResults,
      passCount,
      failCount,
      passRate:       totalResults > 0 ? ((passCount / totalResults) * 100).toFixed(1) : '0',
      averageScore:   aggregate._avg.score ?? 0,
      averageGp:      aggregate._avg.gradePoint ?? 0,
      minScore:       aggregate._min.score ?? 0,
      maxScore:       aggregate._max.score ?? 0,
      byGrade: byGrade.map((r) => ({ grade: r.grade, count: r._count.grade })),
    };
  }

  // ── KPI Analytics Dashboard ───────────────────────────────────────────────

  /**
   * Returns a comprehensive KPI snapshot for the VC / super_admin dashboard.
   * All queries run in a single Prisma $transaction against the read replica.
   */
  async getAnalyticsDashboard(query: AnalyticsQueryDto) {
    const [
      studentCounts, feeStats, resultPendingCount, activePayroll,
      staffCount, activeCal, clearanceCompletion,
      recentPayments, recentApplicants,
    ] = await Promise.all([

      // Student counts by status
      this.prisma.student.groupBy({
        by: ['status'], _count: { status: true },
        where: { deletedAt: null },
      }),

      // Fee collection stats
      this.prisma.studentFee.aggregate({
        _sum:   { amount: true, amountPaid: true, waiverAmount: true },
        _count: { id: true },
      }),

      // Results awaiting senate publication (HOD approved, not yet published)
      this.prisma.studentResult.count({
        where: { status: { in: ['DRAFT', 'HOD_APPROVED', 'DEAN_APPROVED', 'SENATE_PENDING'] } },
      }),

      // Active / in-flight payroll runs
      this.prisma.payrollRun.count({
        where: { status: { in: ['DRAFT', 'COMPUTED', 'APPROVED'] } },
      }),

      // Staff counts by employment status
      this.prisma.staff.groupBy({
        by: ['employmentStatus'], _count: { employmentStatus: true },
        where: { deletedAt: null },
      }),

      // Currently active academic calendar
      this.prisma.academicCalendar.findFirst({ where: { isActive: true } }),

      // Clearance completion rate (CLEARED vs total for graduation-required items)
      this.prisma.studentClearance.groupBy({
        by: ['status'], _count: { status: true },
        where: { clearanceItem: { isRequiredForGraduation: true } },
      }),

      // Last 7 days payment volume
      this.prisma.payment.aggregate({
        where: {
          status:    'SUCCESS',
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        _sum:   { amount: true },
        _count: { id: true },
      }),

      // Applicants this cycle
      this.prisma.applicant.groupBy({
        by: ['status'], _count: { status: true },
        where: { deletedAt: null },
      }),
    ]);

    const grossFees = parseFloat((feeStats._sum.amount ?? 0).toString());
    const waivedFees = parseFloat((feeStats._sum.waiverAmount ?? 0).toString());
    const totalDue = Math.max(0, grossFees - waivedFees);
    const totalPaid = parseFloat((feeStats._sum.amountPaid ?? 0).toString());
    const collectionRate = totalDue > 0 ? ((totalPaid / totalDue) * 100).toFixed(1) : '0';

    const totalCleared = clearanceCompletion.find((c) => c.status === 'CLEARED')?._count.status ?? 0;
    const totalPending = clearanceCompletion.find((c) => c.status === 'PENDING')?._count.status ?? 0;
    const totalClearance = totalCleared + totalPending +
      (clearanceCompletion.find((c) => c.status === 'BLOCKED')?._count.status ?? 0);

    return {
      academicCalendar: activeCal
        ? { academicYear: activeCal.academicYear, status: activeCal.status }
        : null,

      students: {
        total:    studentCounts.reduce((s, r) => s + r._count.status, 0),
        byStatus: studentCounts.map((r) => ({ status: r.status, count: r._count.status })),
      },

      fees: {
        totalInvoiced:   totalDue,
        totalCollected:  totalPaid,
        collectionRate:  `${collectionRate}%`,
        invoiceCount:    feeStats._count.id,
        last7DaysAmount: parseFloat((recentPayments._sum.amount ?? 0).toString()),
        last7DaysCount:  recentPayments._count.id,
      },

      results: {
        pendingPublication: resultPendingCount,
      },

      payroll: {
        activeRuns: activePayroll,
      },

      staff: {
        total:    staffCount.reduce((s, r) => s + r._count.employmentStatus, 0),
        byStatus: staffCount.map((r) => ({ status: r.employmentStatus, count: r._count.employmentStatus })),
      },

      clearance: {
        total:          totalClearance,
        cleared:        totalCleared,
        pending:        totalPending,
        completionRate: totalClearance > 0 ? `${((totalCleared / totalClearance) * 100).toFixed(1)}%` : '0%',
      },

      admissions: {
        byStatus: recentApplicants.map((r) => ({ status: r.status, count: r._count.status })),
      },
    };
  }

  // ── Role-aware dashboard snapshot ──────────────────────────────────────────

  async getMyDashboard(user: {
    sub: string;
    role: string;
    staffScope?: { deptId?: string; facultyId?: string; scopes?: string[] } | null;
    studentId?: string;
  }) {
    const role = user.role;
    const scope = user.staffScope ?? null;

    if (role === 'STUDENT') {
      if (!user.studentId) {
        throw new NotFoundException({ code: 'STUDENT_PROFILE_NOT_FOUND', message: 'Student profile is not available' });
      }
      return { kind: 'student' as const, data: await this.getStudentDashboard(user.studentId, user) };
    }

    if (role === 'VC' || role === 'SUPER_ADMIN') {
      return { kind: 'executive' as const, data: await this.getAnalyticsDashboard({}) };
    }

    if (role === 'HOD') {
      const departmentId = scope?.deptId;
      if (!departmentId) {
        throw new ForbiddenException({ code: 'SCOPE_REQUIRED', message: 'Department scope is required for this dashboard' });
      }
      return { kind: 'department' as const, data: await this.getHodDashboard(departmentId) };
    }

    if (role === 'DEAN') {
      const facultyId = scope?.facultyId;
      if (!facultyId) {
        throw new ForbiddenException({ code: 'SCOPE_REQUIRED', message: 'Faculty scope is required for this dashboard' });
      }
      const [students, pendingResults, staff, departments] = await Promise.all([
        this.prisma.student.count({ where: { department: { facultyId }, status: 'ACTIVE', deletedAt: null } }),
        this.prisma.studentResult.count({ where: { status: { in: ['DRAFT', 'HOD_APPROVED', 'DEAN_APPROVED', 'SENATE_PENDING'] }, courseOffering: { course: { department: { facultyId } } } } }),
        this.prisma.staff.count({ where: { department: { facultyId }, employmentStatus: 'ACTIVE', deletedAt: null } }),
        this.prisma.department.count({ where: { facultyId } }),
      ]);
      return { kind: 'faculty' as const, data: { students, pendingResults, staff, departments } };
    }

    if (role === 'BURSAR') {
      const [fees, payments, pendingRefunds] = await Promise.all([
        this.prisma.studentFee.aggregate({ _sum: { amount: true, amountPaid: true, waiverAmount: true }, _count: { id: true } }),
        this.prisma.payment.aggregate({ where: { status: 'SUCCESS', createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, }, _sum: { amount: true }, _count: { id: true } }),
        this.prisma.payment.count({ where: { status: 'REVERSED' } }),
      ]);
      const invoiced = Number(fees._sum.amount ?? 0) - Number(fees._sum.waiverAmount ?? 0);
      const collected = Number(fees._sum.amountPaid ?? 0);
      return { kind: 'finance' as const, data: { invoiced, collected, outstanding: Math.max(0, invoiced - collected), collectionRate: invoiced > 0 ? Number(((collected / invoiced) * 100).toFixed(1)) : 0, invoiceCount: fees._count.id, last7DaysAmount: Number(payments._sum.amount ?? 0), last7DaysCount: payments._count.id, pendingRefunds } };
    }

    if (role === 'HR_MANAGER') {
      const [staff, activePayroll, leave] = await Promise.all([
        this.prisma.staff.groupBy({ by: ['employmentStatus'], _count: { employmentStatus: true }, where: { deletedAt: null } }),
        this.prisma.payrollRun.count({ where: { status: { in: ['DRAFT', 'COMPUTED', 'APPROVED'] } } }),
        this.prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      ]);
      return { kind: 'people' as const, data: { totalStaff: staff.reduce((n, r) => n + r._count.employmentStatus, 0), byStatus: staff.map((r) => ({ status: r.employmentStatus, count: r._count.employmentStatus })), activePayroll, pendingLeave: leave } };
    }

    const departmentId = scope?.deptId;
    const [students, courses, pendingResults] = await Promise.all([
      this.prisma.student.count({ where: { ...(departmentId ? { departmentId } : {}), status: 'ACTIVE', deletedAt: null } }),
      this.prisma.course.count({ where: { ...(departmentId ? { departmentId } : {}), isActive: true } }),
      this.prisma.studentResult.count({ where: { status: { in: ['DRAFT', 'HOD_APPROVED', 'DEAN_APPROVED', 'SENATE_PENDING'] }, ...(departmentId ? { courseOffering: { course: { departmentId } } } : {}) } }),
    ]);
    return { kind: 'workspace' as const, data: { students, courses, pendingResults, scope: scope ?? null } };
  }

  // ── HOD Department Dashboard ──────────────────────────────────────────────

  async getHodDashboard(departmentId: string) {
    const [students, pendingResults, courses, staff] = await Promise.all([
      this.prisma.student.count({ where: { departmentId, status: 'ACTIVE', deletedAt: null } }),
      this.prisma.studentResult.count({
        where: {
          status: { in: ['DRAFT', 'HOD_APPROVED', 'DEAN_APPROVED', 'SENATE_PENDING'] },
          courseOffering: { course: { departmentId } },
        },
      }),
      this.prisma.course.count({ where: { departmentId, isActive: true } }),
      this.prisma.staff.count({ where: { departmentId, employmentStatus: 'ACTIVE', deletedAt: null } }),
    ]);

    const cgpaBuckets = await this.prisma.$queryRaw<{ classification: string; count: bigint }[]>`
      SELECT
        CASE
          WHEN cgpa >= 4.50 THEN 'First Class'
          WHEN cgpa >= 3.50 THEN 'Second Class (Upper)'
          WHEN cgpa >= 2.40 THEN 'Second Class (Lower)'
          WHEN cgpa >= 1.50 THEN 'Third Class'
          WHEN cgpa >= 1.00 THEN 'Pass'
          ELSE 'Fail / No Results'
        END      AS classification,
        COUNT(*) AS count
      FROM students
      WHERE "departmentId" = ${departmentId}::UUID
        AND status = 'ACTIVE'
        AND "deletedAt" IS NULL
      GROUP BY classification
      ORDER BY MIN(cgpa) DESC
    `;

    return {
      totalActiveStudents: students,
      resultsAwaitingHodApproval: pendingResults,
      totalCourses: courses,
      totalActiveStaff: staff,
      cgpaDistribution: cgpaBuckets.map((b) => ({
        classification: b.classification,
        count: Number(b.count),
      })),
    };
  }

  // ── Student Self-Service Dashboard ────────────────────────────────────────

  async getStudentDashboard(studentId: string, requestingUser: { sub: string; role: string }) {
    const [student, results, requiredClearanceItems, clearances, activeFees, loans] = await Promise.all([
      this.prisma.student.findUniqueOrThrow({
        where: { id: studentId },
        select: {
          userId: true, matricNo: true, firstName: true, lastName: true, cgpa: true,
          level: true, status: true, feeCleared: true,
          programme:  { select: { name: true, durationYears: true } },
          department: { select: { name: true } },
        },
      }),
      // Deep-audit fix (Aug 2026): this query previously selected
      // academicYear, semester, and totalScore directly on StudentResult —
      // none of those are real fields on this model (academicYear/semester
      // number live on the related Semester model; the score field is
      // called `score`, not `totalScore`). A select referencing fields
      // absent from the Prisma schema fails to type-check, so this method
      // could not have compiled as originally written — see
      // docs/CHANGELOG.md for the full account.
      this.prisma.studentResult.findMany({
        where:   { studentId, status: 'SENATE_PUBLISHED' },
        orderBy: { createdAt: 'desc' },
        take:    8,
        select: {
          grade: true, score: true, gradePoint: true,
          semester: { select: { academicYear: true, semesterNumber: true } },
          courseOffering: { select: { course: { select: { code: true, title: true, creditUnits: true } } } },
        },
      }),
      this.prisma.clearanceItem.findMany({
        where: { isActive: true, isRequiredForGraduation: true },
        select: { id: true },
      }),
      this.prisma.studentClearance.findMany({
        where:   { studentId },
        include: { clearanceItem: { select: { name: true, isRequiredForGraduation: true, isActive: true } } },
      }),
      // Same issue: StudentFee has no amountDue/balance columns (the real
      // fields are amount/amountPaid/waiverAmount), and FeeSchedule has no
      // `name` column (it has `feeType`, an enum, plus a free-text
      // `description`). Balance is derived below instead of selected.
      this.prisma.studentFee.findMany({
        where:   { studentId, status: { notIn: ['PAID', 'WAIVED'] } },
        select: {
          amount: true, amountPaid: true, waiverAmount: true, status: true,
          feeSchedule: { select: { feeType: true, description: true } },
        },
      }),
      this.prisma.libraryLoan.findMany({
        where:   { user: { student: { id: studentId } }, status: 'ACTIVE' },
        take:    5,
        select: {
          dueDate: true, status: true, fineAmount: true,
          libraryItem: { select: { title: true } },
        },
      }),
    ]);

    // Deep-audit fix (Aug 2026): STUDENT role could previously view ANY
    // student's dashboard by ID — @Roles('STUDENT', ...,'SUPER_ADMIN') on the controller
    // only checks role membership, never ownership of this specific
    // studentId. REGISTRAR/SUPER_ADMIN (also in that @Roles() list) are
    // legitimately allowed to view any student's dashboard, so only the
    // STUDENT case needs an ownership check here.
    if (requestingUser.role === 'STUDENT' && student.userId !== requestingUser.sub) {
      throw new ForbiddenException({
        code: 'RBAC_FORBIDDEN',
        message: 'You may only view your own dashboard',
      });
    }

    const clearanceEvaluation = evaluateAdministrativeClearance(
      requiredClearanceItems.map((item) => item.id),
      clearances.map((clearance) => ({ clearanceItemId: clearance.clearanceItemId, status: clearance.status })),
    );
    const allCleared = clearanceEvaluation.administrativelyCleared;

    const outstandingFees = activeFees.map((f) => ({
      ...f,
      balance: f.amount.sub(f.amountPaid).sub(f.waiverAmount),
    }));

    return {
      student,
      recentResults:  results,
      clearance: {
        items:      clearances,
        allCleared,
        // Deep-audit fix (Aug 2026): this was always identical to
        // `allCleared` — i.e. purely an administrative-clearance signal
        // with no academic-completion check (CGPA, credit units earned,
        // required courses passed) behind it at all, despite the field's
        // name. Left as an explicit alias (not removed) so existing
        // frontend consumers don't silently lose the field, but renamed
        // in spirit: see StudentsService.checkGraduationEligibility() (new
        // — deep-audit graduation-pipeline fix) for the real academic
        // check. graduationEligible here reflects ADMINISTRATIVE clearance
        // only; it is not a graduation determination on its own.
        administrativelyCleared: allCleared,
        graduationEligible: allCleared,
        requiredItemCount: clearanceEvaluation.requiredItemCount,
        completedItemCount: clearanceEvaluation.completedItemCount,
        pendingItemCount: clearanceEvaluation.pendingItemCount,
        blockedItemCount: clearanceEvaluation.blockedItemCount,
      },
      outstandingFees,
      activeLoans:     loans,
    };
  }
}
