import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Prisma, ReportFormat, ReportStatus, ReportType } from '@prisma/client';
import type { Job } from 'bullmq';
import { decryptPii } from '@uniportal/utils';
import { PrismaService } from '../../../database/prisma.service';
import { ReportArtifactService } from '../services/report-artifact.service';

export interface ReportJobPayload {
  reportJobId:  string;
  reportType:   ReportType;
  reportFormat: ReportFormat;
  triggeredBy:  string;
  parameters:   Record<string, unknown>;
}

/**
 * ReportGenerationProcessor — BullMQ worker for the 'report-generation' queue.
 *
 * Handles large, async report creation:
 *  1. Marks job as PROCESSING
 *  2. Queries the read replica for report data
 *  3. Generates the output file (XLSX/CSV/PDF)
 *  4. Stores in private S3 (staging/production) or an owner-only local artifact directory in test/development
 *  5. Marks job as COMPLETED with generatedUrl and urlExpiresAt
 *
 * On failure: marks job FAILED, logs error, DLQ processor fires PagerDuty alert.
 */
@Processor('report-generation')
export class ReportGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportGenerationProcessor.name);
  private readonly maxExportRows = Number(process.env.MAX_REPORT_EXPORT_ROWS ?? 25_000);

  constructor(private readonly prisma: PrismaService, private readonly artifacts: ReportArtifactService) { super(); }

  async process(job: Job<ReportJobPayload>): Promise<void> {
    const { reportJobId, reportType, reportFormat, parameters } = job.data;
    this.logger.log(`Processing report job ${reportJobId} — type: ${reportType}`);

    // Mark as PROCESSING
    await this.prisma.reportJob.update({
      where: { id: reportJobId },
      data:  { status: ReportStatus.PROCESSING, startedAt: new Date() },
    });

    try {
      await job.updateProgress(10);

      // ── Query data from read replica ──────────────────────────────────────
      const rows = await this.fetchReportData(reportType, parameters);
      if (rows.length > this.maxExportRows) {
        throw new Error(`REPORT_ROW_LIMIT_EXCEEDED: This report exceeds the configured ${this.maxExportRows.toLocaleString()}-row export limit. Narrow the date range or request a governed bulk export.`);
      }
      await job.updateProgress(60);

      // ── Artifact generation + private object storage ───────────────────────
      const artifact = await this.artifacts.build(reportJobId, reportFormat, rows);
      await job.updateProgress(90);

      await this.prisma.reportJob.update({
        where: { id: reportJobId },
        data: {
          status:       ReportStatus.COMPLETED,
          totalRows:    rows.length,
          generatedUrl: artifact.url,
          urlExpiresAt: artifact.expiresAt,
          completedAt:  new Date(),
        },
      });
      if (parameters?.kind === 'ndpr_sar' || parameters?.kind === 'ndpr_portability') {
        await this.prisma.dataSubjectRequest.updateMany({ where: { reportJobId }, data: { status: 'COMPLETED', completedAt: new Date() } });
      }

      await job.updateProgress(100);
      this.logger.log(`Report job ${reportJobId} COMPLETED — ${rows.length} rows, format: ${reportFormat}`);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Report job ${reportJobId} FAILED: ${message}`);

      await this.prisma.reportJob.update({
        where: { id: reportJobId },
        data: {
          status:       ReportStatus.FAILED,
          errorMessage: message,
          completedAt:  new Date(),
        },
      });
      if (parameters?.kind === 'ndpr_sar' || parameters?.kind === 'ndpr_portability') {
        await this.prisma.dataSubjectRequest.updateMany({ where: { reportJobId }, data: { status: 'REJECTED' } });
      }

      // Re-throw so BullMQ can handle retries / DLQ routing
      throw error;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async fetchReportData(
    type: ReportType,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const db = this.prisma.readReplica;
    const academicYear = params['academicYear'] as string | undefined;
    const deptId       = params['departmentId'] as string | undefined;
    const dateFrom     = params['dateFrom']     ? new Date(params['dateFrom'] as string) : undefined;
    const dateTo       = params['dateTo']       ? new Date(params['dateTo'] as string)   : undefined;

    switch (type) {
      case ReportType.ENROLMENT:
        return db.student.findMany({
          where: {
            ...(academicYear ? { entryAcademicYear: academicYear } : {}),
            ...(deptId       ? { departmentId: deptId }             : {}),
            deletedAt: null,
          },
          select: {
            matricNo: true, firstName: true, lastName: true,
            level: true, modeOfStudy: true, status: true, cgpa: true,
            programme: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } },
          },
          take: this.maxExportRows + 1,
        }) as Promise<Record<string, unknown>[]>;

      case ReportType.REVENUE:
        return db.payment.findMany({
          where: {
            status: 'SUCCESS',
            ...(dateFrom || dateTo ? {
              createdAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo   ? { lte: dateTo }   : {}),
              },
            } : {}),
          },
          select: {
            providerRef: true, amount: true, provider: true,
            paidAt: true,
            student: { select: { matricNo: true, firstName: true, lastName: true } },
          },
          take: this.maxExportRows + 1,
        }) as Promise<Record<string, unknown>[]>;

      case ReportType.CGPA_DISTRIBUTION:
        return db.student.findMany({
          where: {
            status: 'ACTIVE',
            ...(deptId ? { departmentId: deptId } : {}),
            deletedAt: null,
          },
          select: {
            matricNo: true, firstName: true, lastName: true,
            cgpa: true, level: true, status: true,
            programme:  { select: { name: true } },
            department: { select: { name: true } },
          },
          take: this.maxExportRows + 1,
        }) as Promise<Record<string, unknown>[]>;

      case ReportType.RESULTS_STATISTICS: {
        const where: Record<string, unknown> = { status: 'SENATE_PUBLISHED' };
        if (academicYear) where['semester'] = { academicYear };
        if (deptId) where['courseOffering'] = { course: { departmentId: deptId } };
        return db.studentResult.findMany({
          where: where as Prisma.StudentResultWhereInput,
          select: {
            grade: true, score: true, gradePoint: true,
            semester: { select: { academicYear: true, semesterNumber: true } },
            courseOffering: { select: { course: { select: { code: true, title: true } } } },
          },
          take: this.maxExportRows + 1,
        }) as Promise<Record<string, unknown>[]>;
      }

      case ReportType.PAYROLL_SUMMARY:
        return db.payslip.findMany({
          where: {
            ...(dateFrom || dateTo ? {
              createdAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo   ? { lte: dateTo }   : {}),
              },
            } : {}),
          },
          select: {
            grossPay: true, netPay: true, totalDeductions: true,
            createdAt: true, payPeriodDate: true, gradeLevel: true,
            staff: { select: { employeeNo: true, firstName: true, lastName: true, designation: true } },
          },
          take: this.maxExportRows + 1,
        }) as Promise<Record<string, unknown>[]>;

      case ReportType.LIBRARY_USAGE:
        return db.libraryLoan.findMany({
          where: {
            ...(dateFrom || dateTo ? {
              borrowedAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo   ? { lte: dateTo }   : {}),
              },
            } : {}),
          },
          select: {
            borrowedAt: true, returnedAt: true, status: true, fineAmount: true,
            user: {
              select: {
                student: { select: { matricNo: true, person: { select: { firstName: true, lastName: true } } } },
              },
            },
            libraryItem: { select: { title: true, author: true, category: true } },
          },
          take: this.maxExportRows + 1,
        }) as Promise<Record<string, unknown>[]>;

      case ReportType.CLEARANCE_STATUS:
        return db.studentClearance.findMany({
          select: {
            status: true, clearedAt: true, blockReason: true,
            student:       { select: { matricNo: true, firstName: true, lastName: true } },
            clearanceItem: { select: { name: true, responsibleRole: true } },
          },
          take: this.maxExportRows + 1,
        }) as Promise<Record<string, unknown>[]>;

      case ReportType.STAFF_DIRECTORY:
        return db.staff.findMany({
          where: { deletedAt: null },
          select: {
            employeeNo: true, firstName: true, lastName: true, designation: true,
            salaryGrade: { select: { gradeLevel: true, step: true } }, employmentStatus: true, appointmentDate: true,
            department: { select: { name: true, code: true } },
          },
          take: this.maxExportRows + 1,
        }) as Promise<Record<string, unknown>[]>;

      // AUDIT-H2 fix: previously fell through to `default: return []` for
      // EVERY custom report — including PrivacyService's SAR/portability
      // exports, which were therefore always marked COMPLETED with an
      // empty payload. Reads cross-module (User/Student/Staff/Payment/
      // StudentResult) directly, matching the pattern every OTHER case in
      // this switch already uses — Reports is spec §5.1's one explicitly
      // read-only-across-all-modules exception to the module-boundary rule.
      case ReportType.CUSTOM:
        return this.fetchCustomReportData(params);

      default:
        return [];
    }
  }

  private async fetchCustomReportData(parameters: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const db = this.prisma.readReplica;
    const kind = parameters?.kind as string | undefined;

    if (kind === 'ndpr_sar' || kind === 'ndpr_portability') {
      const subjectUserId = parameters.subjectUserId as string;
      const user = await db.user.findUnique({
        where:  { id: subjectUserId },
        select: {
          id: true, email: true, phone: true, isActive: true, mfaEnabled: true,
          lastLoginAt: true, createdAt: true,
          student: {
            select: {
              matricNo: true, firstName: true, lastName: true, middleName: true,
              dateOfBirth: true, gender: true, nationality: true, phone: true,
              currentAddress: true, permanentAddress: true, cgpa: true,
              status: true, feeCleared: true, entryAcademicYear: true,
            },
          },
          staff: {
            select: {
              employeeNo: true, firstName: true, lastName: true, designation: true,
              salaryGrade: { select: { gradeLevel: true, step: true } }, employmentStatus: true, appointmentDate: true,
            },
          },
        },
      });
      if (!user) throw new Error(`PRIVACY_EXPORT_SUBJECT_NOT_FOUND: ${subjectUserId}`);

      const [payments, results, auditLogs, patient, appointments, medicalRecords, prescriptions, libraryLoans, roomAllocations, alumni, applicant] = await Promise.all([
        db.payment.findMany({
          where: { student: { userId: subjectUserId } }, take: 1000,
          select: { amount: true, provider: true, status: true, createdAt: true },
        }),
        db.studentResult.findMany({
          where: { student: { userId: subjectUserId }, status: 'SENATE_PUBLISHED' },
          select: { grade: true, score: true, gradePoint: true, semester: { select: { name: true, academicYear: true } } },
          take: 1000,
        }),
        db.auditLog.findMany({
          where: { actorId: subjectUserId }, take: 500, orderBy: { createdAt: 'desc' },
          select: { action: true, targetTable: true, createdAt: true },
        }),
        db.patient.findUnique({
          where: { userId: subjectUserId },
          select: { bloodGroup: true, genotype: true, allergies: true, chronicConditions: true, emergencyContactName: true, emergencyContactPhone: true },
        }),
        db.appointment.findMany({
          where: { patient: { userId: subjectUserId } }, take: 1000,
          select: { appointmentDate: true, reason: true, status: true, notes: true, createdAt: true },
        }),
        db.medicalRecord.findMany({
          where: { patient: { userId: subjectUserId } }, take: 1000,
          select: { diagnosis: true, treatmentNotes: true, prescriptionNotes: true, followUpDate: true, createdAt: true },
        }),
        db.prescription.findMany({
          where: { patient: { userId: subjectUserId } }, take: 1000,
          select: { dosageInstructions: true, quantity: true, dispensedAt: true, createdAt: true, drug: { select: { name: true, genericName: true, form: true, unit: true } } },
        }),
        db.libraryLoan.findMany({
          where: { userId: subjectUserId }, take: 1000,
          select: { borrowedAt: true, dueDate: true, returnedAt: true, renewalCount: true, fineAmount: true, finePaid: true, status: true, libraryItem: { select: { title: true, author: true, isbn: true } } },
        }),
        db.roomAllocation.findMany({
          where: { student: { userId: subjectUserId } }, take: 1000,
          select: { academicYear: true, startDate: true, endDate: true, status: true, room: { select: { roomNumber: true, hostelBlock: { select: { name: true } } } } },
        }),
        db.alumni.findUnique({
          where: { userId: subjectUserId },
          select: { graduationYear: true, programme: true, classAwarded: true, cgpaAtGrad: true, occupation: true, employer: true, industry: true, linkedinUrl: true, currentCountry: true, currentCity: true, bio: true, isProfilePublic: true, donations: { select: { amount: true, currency: true, isAnonymous: true, message: true, status: true, createdAt: true } } },
        }),
        db.applicant.findFirst({
          // Applicant.personId is a Person id, not a User id. Resolve the
          // applicant through the Student relation owned by this User.
          where: { student: { is: { userId: subjectUserId } } },
          select: {
            applicationNo: true, firstName: true, lastName: true, middleName: true,
            dateOfBirth: true, gender: true, nationality: true, stateOfOrigin: true, lga: true,
            phone: true, email: true, admissionType: true, submittedAt: true, status: true,
            oLevelResults: true, passportPhotoUrl: true,
            person: { select: { firstName: true, lastName: true, middleName: true, dateOfBirth: true, gender: true, nationality: true, stateOfOrigin: true, lga: true, primaryEmail: true, primaryPhone: true } },
            addresses: { select: { type: true, line1: true, line2: true, city: true, lga: true, state: true, country: true } },
            guardians: { select: { fullName: true, relationship: true, phone: true, email: true, occupation: true, address: true } },
            emergencyContacts: { select: { fullName: true, relationship: true, phone: true, email: true, address: true } },
            application: { select: {
              education: { select: { institution: true, qualification: true, programme: true, startYear: true, endYear: true, gradeOrCgpa: true, certificateNo: true, verificationStatus: true } },
              documents: { select: { documentType: true, originalFileName: true, mimeType: true, documentNumber: true, status: true, verifiedAt: true } },
              oLevelSittings: { select: { examType: true, examYear: true, sittingNumber: true, verificationStatus: true, verificationRef: true, subjects: { select: { subject: true, grade: true } } } },
            } },
          },
        }),
      ]);

      const decrypt = (value: string | null) => value ? decryptPii(value) : null;
      const safeMedicalRecords = medicalRecords.map((record) => ({
        ...record,
        diagnosis: decrypt(record.diagnosis),
        treatmentNotes: decrypt(record.treatmentNotes),
        prescriptionNotes: decrypt(record.prescriptionNotes),
      }));
      const safePrescriptions = prescriptions.map((prescription) => ({
        ...prescription,
        dosageInstructions: decrypt(prescription.dosageInstructions),
      }));

      return [{
        exportedAt: new Date().toISOString(),
        profile: { id: user.id, email: user.email, phone: user.phone, isActive: user.isActive, mfaEnabled: user.mfaEnabled, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt },
        studentProfile: user.student ?? null,
        staffProfile: user.staff ?? null,
        applicantProfile: applicant,
        payments,
        academicResults: results,
        clinicalProfile: patient,
        appointments,
        medicalRecords: safeMedicalRecords,
        prescriptions: safePrescriptions,
        libraryLoans,
        roomAllocations,
        alumniProfile: alumni,
        ownAuditTrail: auditLogs,
      }];
    }

    throw new Error(`REPORT_CUSTOM_KIND_UNSUPPORTED: ${kind ?? 'missing'}`);
  }
}
