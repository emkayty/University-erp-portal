import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, AdmissionType, ApplicantStatus, CalendarStatus, CapsAdmissionStatus, StudentStatus, CourseRegStatus, FeeClearancePolicy, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';

import { encryptPii, getDegreeClass } from '@uniportal/utils';

import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../database/prisma.service';
import { RlsContextService } from '../../common/rls/rls-context.service';
import { AlumniService } from '../alumni/alumni.service';
import { MatricNumberService } from './matric-number.service';
import { PasswordService } from '../auth/services/password.service';
import type { MatriculateDto, RegisterCoursesDto, UpdateStudentDto, UpdateStudentStatusDto } from './dto/students.dto';

export interface StudentRegisteredEvent  { type: 'student.registered';  studentId: string; userId: string; programmeId: string; matricNo: string; }
export interface StudentGraduatedEvent   { type: 'student.graduated';   studentId: string; userId: string; matricNo: string; cgpa: number; }

/**
 * P0-2 / P1-2 FIX (this pass — see docs/CHANGELOG.md): two things
 * fixed together, same reasoning as ResultsService (see that file):
 *   1. Every Student/CourseRegistration access now routes through
 *      `this.prisma.forRequest(this.rlsContext)` (reads) or
 *      `this.prisma.runExclusive(this.rlsContext, ...)` (transactional
 *      writes) instead of the plain client — both are FORCE-RLS models.
 *   2. registerCourses()'s credit-unit check and its write used to be two
 *      SEPARATE steps — a read outside any transaction, then an unrelated
 *      later transaction for the insert. Two concurrent calls for the same
 *      student could each read the "before" total, each independently pass
 *      the min/max check, and both commit different course offerings —
 *      landing the student over the credit-unit cap with no validation
 *      ever having seen the combined total. Fixed by merging the
 *      credit-unit read, its validation, and the insert into ONE
 *      runExclusive() transaction that opens with
 *      `pg_advisory_xact_lock(hashtext(studentId))`, mirroring the same
 *      pattern payments.service.ts and (now) results.service.ts use for
 *      this exact class of race. The other pre-flight checks (student
 *      status, fee clearance, calendar window, offering validity,
 *      prerequisites) don't depend on concurrent registrations for the
 *      same student, so they stay outside the lock — only the genuinely
 *      racy read-then-write needs it.
 */
@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma:     PrismaService,
    private readonly audit:      AuditService,
    private readonly outbox:     OutboxService,
    private readonly matricSvc:  MatricNumberService,
    private readonly passwords:  PasswordService,
    private readonly rlsContext: RlsContextService,
    private readonly alumni:     AlumniService,
  ) {}

  // ── Matriculation ─────────────────────────────────────────────────────────
  /**
   * Creates Student + User records from an accepted Applicant.
   * Generates matric number via advisory-lock-safe sequential service.
   * Emits student.registered event for downstream modules.
   */
  /**
   * Deep-audit fix (Aug 2026): the previous inline generator
   * (randomBytes(8).toString('hex').toUpperCase() + '@1') could never
   * contain a lowercase letter — hex digits uppercased are 0-9A-F only —
   * despite its own comment claiming "Meets password policy". It didn't:
   * validatePasswordStrength() requires upper+lower+digit+special, and
   * because matriculate() hashes this value directly without validating
   * it first, that mismatch was never actually caught. Every new
   * student's day-one credential failed the institution's own documented
   * password standard. This explicitly constructs one guaranteed
   * character from each required class, fills the rest from the full
   * mixed set, and shuffles — rather than hoping randomness happens to
   * cover all four classes in a short string. Ambiguous characters
   * (0/O, 1/l/I) are excluded, since this value is typically read off a
   * printed admission slip.
   */
  private generateTempPassword(): string {
    const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower   = 'abcdefghijkmnpqrstuvwxyz';
    const digits  = '23456789';
    const special = '!@#$%&*';
    const all     = upper + lower + digits + special;

    const pick = (charset: string) => charset[randomInt(charset.length)]!;
    const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
    while (chars.length < 16) chars.push(pick(all));

    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j]!, chars[i]!];
    }
    return chars.join('');
  }

  async matriculate(dto: MatriculateDto, actorId: string) {
    const applicant = await this.prisma.applicant.findUniqueOrThrow({
      where:   { id: dto.applicantId },
      include: {
        programmeChoice1: { include: { department: { include: { faculty: true } } } },
        student: true,
        application: {
          include: {
            offers: {
              where: { status: 'ACCEPTED' },
              orderBy: [{ acceptedAt: 'desc' }, { issueDate: 'desc' }],
              take: 1,
              include: { programme: { include: { department: { include: { faculty: true } } } } },
            },
          },
        },
      },
    });

    if (!applicant.personId) {
      throw new UnprocessableEntityException({
        code: 'IDENTITY_INTEGRITY_ERROR',
        message: 'Applicant cannot be matriculated because the canonical Person identity is missing.',
      });
    }

    const admissionPolicy = await this.prisma.institutionSettings.findFirst({
      select: {
        requireAdmissionClearance: true,
        pendingAdmissionClearance: true,
        pendingAdmissionClearanceEffectiveAt: true,
      },
    });
    const pendingIsDue = Boolean(
      admissionPolicy?.pendingAdmissionClearance !== null &&
      admissionPolicy?.pendingAdmissionClearanceEffectiveAt &&
      admissionPolicy.pendingAdmissionClearanceEffectiveAt <= new Date(),
    );
    const clearanceRequired = pendingIsDue
      ? admissionPolicy?.pendingAdmissionClearance ?? true
      : admissionPolicy?.requireAdmissionClearance ?? true;
    const matriculatableStatuses: ApplicantStatus[] = clearanceRequired
      ? [ApplicantStatus.CLEARANCE]
      : [ApplicantStatus.ACCEPTED, ApplicantStatus.CLEARANCE];
    if (!matriculatableStatuses.includes(applicant.status)) {
      throw new UnprocessableEntityException({
        code: clearanceRequired ? 'ADMISSION_CLEARANCE_REQUIRED' : 'BUSINESS_RULE_INVALID_STATE',
        message: clearanceRequired
          ? 'Applicant must complete institutional clearance before matriculation.'
          : `Cannot matriculate applicant with status "${applicant.status}". Applicant must be ACCEPTED or CLEARANCE.`,
        requireAdmissionClearance: clearanceRequired,
      });
    }

    if (applicant.student) {
      throw new ConflictException({
        code: 'DUPLICATE_RESOURCE', message: 'Applicant has already been matriculated',
      });
    }

    const capsRequiredTypes: AdmissionType[] = [AdmissionType.UTME, AdmissionType.DE, AdmissionType.TRANSFER];
    const capsRequired = capsRequiredTypes.includes(applicant.admissionType);
    if (capsRequired && applicant.capsAdmissionStatus !== CapsAdmissionStatus.CANDIDATE_ACCEPTED) {
      throw new UnprocessableEntityException({
        code: 'CAPS_ACCEPTANCE_REQUIRED',
        message: 'Institutional matriculation is blocked until the candidate is accepted on JAMB CAPS.',
        capsAdmissionStatus: applicant.capsAdmissionStatus,
      });
    }

    const acceptedOffer = applicant.application?.offers[0];
    if (!acceptedOffer) {
      throw new UnprocessableEntityException({
        code: 'ADMISSION_PLACEMENT_REQUIRED',
        message: 'Applicant cannot be matriculated without an accepted admission offer and authoritative programme placement.',
      });
    }
    const programme = acceptedOffer.programme;
    const department = programme.department;
    const curriculumVersion = await this.prisma.curriculumVersion.findFirst({
      where: { programmeId: programme.id, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (!curriculumVersion) {
      throw new UnprocessableEntityException({ code: 'CURRICULUM_NOT_CONFIGURED', message: `No active curriculum version is configured for ${programme.name}.` });
    }
    const admYear     = applicant.applicationNo.slice(0, 4); // First 4 chars = year
    const entryLevel  = dto.entryLevel ?? 100;
    const matricNo    = await this.matricSvc.generate(department.code, admYear);

    // Get active academic calendar for student record
    const calendar = await this.prisma.academicCalendar.findFirst({
      where: { isActive: true, status: CalendarStatus.ACTIVE },
    });

    const tempPassword = dto.temporaryPassword ?? this.generateTempPassword();

    const passwordHash = await this.passwords.hash(tempPassword);

    // Atomic: create User + Student + update Applicant status
    const { student, user } = await this.prisma.runExclusive(this.rlsContext, async (tx) => {
      // Create user account
      const user = await tx.user.create({
        data: {
          email:        applicant.email.toLowerCase(),
          phone:        applicant.phone,
          passwordHash,
          isActive:     true,
          roles: { create: { roleName: 'STUDENT' } },
        },
      });

      // Create student record
      const student = await tx.student.create({
        data: {
          matricNo,
          personId:         applicant.personId!,
          applicantId:      applicant.id,
          userId:           user.id,
          firstName:        applicant.firstName,
          lastName:         applicant.lastName,
          middleName:       applicant.middleName ?? null,
          dateOfBirth:      applicant.dateOfBirth,
          gender:           applicant.gender,
          nationality:      applicant.nationality,
          stateOfOrigin:    applicant.stateOfOrigin ?? null,
          phone:            applicant.phone,
          email:            applicant.email.toLowerCase(),
          nin:              applicant.nin ?? null,
          ninVerified:      applicant.ninVerified,
          programmeId:      programme.id,
          curriculumVersionId: curriculumVersion.id,
          departmentId:     department.id,
          level:            entryLevel,
          entryAcademicYear: admYear + '/' + (parseInt(admYear) + 1),
          status:           StudentStatus.ACTIVE,
          feeCleared:       false,
        },
      });

      // Mark applicant as MATRICULATED
      await tx.applicant.update({ where: { id: applicant.id }, data: { status: ApplicantStatus.MATRICULATED } });
      if (applicant.application) {
        await tx.application.update({ where: { id: applicant.application.id }, data: { status: 'MATRICULATED', lastSavedAt: new Date() } });
      }

      // Seed clearance items for this student (auto-created)
      // CB-3 fix: clearanceItem/studentClearance added in P5 schema.
      // Graceful handling: if migration hasn't run yet, skip silently.
      try {
        const clearanceItems = await tx.clearanceItem.findMany({
          where: { isActive: true },
        });
        if (clearanceItems.length > 0) {
          await tx.studentClearance.createMany({
            data: clearanceItems.map((ci) => ({
              studentId:       student.id,
              clearanceItemId: ci.id,
              status:          'PENDING',
            })),
            skipDuplicates: true,
          });
        }
      } catch (e) {
        this.logger.warn('Clearance seeding skipped (P5 migration pending):', String(e));
      }

      await tx.auditLog.create({
        data: {
          actorId:     actorId,
          action:      AuditAction.CREATE,
          targetTable: 'students',
          targetId:    student.id,
          newValues:   { matricNo, applicantId: applicant.id },
        },
      });

      // C1 fix: was this.emitter.emit('student.registered', ...) after the
      // transaction closed — with zero @OnEvent listeners in this codebase,
      // that event went nowhere regardless. Moved inside the transaction
      // and onto the outbox so it's atomic with the commit and durably
      // delivered; NotificationsProcessor has a 'student.registered' case
      // already (welcome email). Downstream modules (Fees/Timetable/LMS/
      // Hostels per the spec's module dependency graph) that need to react
      // to this event still need their own @OnEvent-equivalent consumer —
      // this fix makes the event actually arrive, it doesn't yet add those
      // consumers (out of scope here; see docs/CHANGELOG.md).
      await this.outbox.write(tx, 'student.registered', {
        studentId:   student.id,
        userId:      user.id,
        programmeId: programme.id,
        matricNo,
      });

      return { student, user };
    });

    this.logger.log(`Matriculated: ${matricNo} (applicant ${applicant.id})`);
    return { student, temporaryPassword: tempPassword };
  }

  // ── Find / List ────────────────────────────────────────────────────────────
  async findAll(filters: {
    status?: StudentStatus; programmeId?: string; level?: number;
    departmentId?: string; page: number; pageSize: number;
  }) {
    const { status, programmeId, level, departmentId, page, pageSize } = filters;
    const where = {
      ...(status       ? { status }       : {}),
      ...(programmeId  ? { programmeId }  : {}),
      ...(level        ? { level }        : {}),
      ...(departmentId ? { departmentId } : {}),
    };
    // Was this.prisma.$transaction([student.findMany(...), student.count(...)])
    // — Prisma's array/batch form. The ambient RLS transaction client
    // (Prisma.TransactionClient) doesn't expose $transaction itself, so a
    // batched pair of queries can't be nested inside it the way this used
    // to work on the plain client. Sequential awaits through forRequest()
    // give up the one-round-trip batching optimization but are correct
    // under RLS; this is a paginated list endpoint, not a hot path where
    // that trade-off matters.
    const db = this.prisma.forRequest(this.rlsContext);
    const students = await db.student.findMany({
      where,
      select: {
        id: true, matricNo: true, firstName: true, lastName: true, middleName: true,
        dateOfBirth: true, gender: true, nationality: true, stateOfOrigin: true,
        phone: true, email: true, programmeId: true, departmentId: true,
        level: true, modeOfStudy: true, entryAcademicYear: true, cgpa: true,
        totalCreditUnitsEarned: true, status: true, passportPhotoUrl: true,
        createdAt: true, updatedAt: true,
        programme: { select: { name: true, code: true } },
        department: { select: { name: true, code: true } },
      },
      orderBy: { matricNo: 'asc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    });
    const total = await db.student.count({ where });
    return { students, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: string) {
    return this.prisma.forRequest(this.rlsContext).student.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, matricNo: true, firstName: true, lastName: true, middleName: true,
        dateOfBirth: true, gender: true, nationality: true, stateOfOrigin: true,
        phone: true, email: true, programmeId: true, departmentId: true,
        level: true, modeOfStudy: true, entryAcademicYear: true, cgpa: true,
        totalCreditUnitsEarned: true, status: true, passportPhotoUrl: true,
        createdAt: true, updatedAt: true,
        programme: { include: { department: { include: { faculty: true } } } },
        user: { select: { email: true, isActive: true, mfaEnabled: true } },
        academicHistory: { orderBy: { academicYear: 'desc' } },
      },
    });
  }

  async findByMatricNo(matricNo: string) {
    return this.prisma.forRequest(this.rlsContext).student.findUniqueOrThrow({
      where: { matricNo },
      select: { id: true, matricNo: true, firstName: true, lastName: true, middleName: true, level: true, status: true, cgpa: true, programme: true, department: true },
    });
  }

  async update(id: string, dto: UpdateStudentDto, actorId: string) {
    const db = this.prisma.forRequest(this.rlsContext);
    const student = await db.student.findUniqueOrThrow({ where: { id } });
    const updated = await db.student.update({ where: { id }, data: dto });
    const personData: Record<string, unknown> = {};
    for (const key of ['firstName','lastName','middleName','dateOfBirth','gender','nationality','stateOfOrigin','phone','email']) {
      if (key in dto) {
        const value = (dto as Record<string, unknown>)[key];
        personData[key === 'email' ? 'primaryEmail' : key === 'phone' ? 'primaryPhone' : key] = value;
      }
    }
    if (Object.keys(personData).length) await db.person.update({ where: { id: student.personId }, data: personData });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'students', targetId: id,
      oldValues: { phone: student.phone }, newValues: dto as Record<string, unknown>,
    }, actorId);
    return updated;
  }

  // ── Course Registration ────────────────────────────────────────────────────
  /**
   * Transaction 1 — Course Registration with all guards:
   *  1. Active calendar check
   *  2. Registration window check (REGISTRATION_OPEN event)
   *  3. Fee cleared check
   *  4. Prerequisite validation
   *  5. Credit unit bounds (min/max per semester)
   *  6. Duplicate registration prevention (advisory lock + unique constraint)
   */
  private async assertRegistrationWindow(now = new Date(), operation: 'registration' | 'drop' = 'registration'): Promise<void> {
    const calendar = await this.prisma.academicCalendar.findFirst({
      where: { isActive: true },
      include: {
        events: {
          where: { eventType: { in: ['REGISTRATION_OPEN', 'REGISTRATION_CLOSE'] } },
          orderBy: { startDate: 'asc' },
        },
      },
    });
    if (!calendar || calendar.status !== 'ACTIVE') {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_CALENDAR_INACTIVE',
        message: 'No active academic calendar. Course registration is currently closed.',
      });
    }

    const opens = calendar.events.filter((event) => event.eventType === 'REGISTRATION_OPEN');
    const closes = calendar.events.filter((event) => event.eventType === 'REGISTRATION_CLOSE');
    const activePeriod = opens
      .map((open) => {
        const close = closes.find((candidate) => candidate.startDate >= open.startDate);
        if (!close) return null;
        const openEnd = open.endDate ?? close.startDate;
        const closeStart = close.startDate;
        return { start: open.startDate, end: openEnd < closeStart ? openEnd : closeStart };
      })
      .find((period): period is { start: Date; end: Date } => period !== null && now >= period.start && now <= period.end);

    if (!activePeriod) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_CALENDAR_INACTIVE',
        message: operation === 'drop'
          ? 'The add/drop window has closed or its authoritative open/close period is incomplete.'
          : 'The registration window is closed or its authoritative open/close period is incomplete.',
      });
    }
  }

  async registerCourses(studentId: string, dto: RegisterCoursesDto, actorId: string) {
    // Pre-flight checks (outside transaction — cheaper, and none of these
    // depend on what OTHER concurrent registration calls for this same
    // student are doing, unlike the credit-unit check further down).
    const student = await this.prisma.forRequest(this.rlsContext).student.findUniqueOrThrow({ where: { id: studentId } });

    const registrationEligibleStatuses: StudentStatus[] = [StudentStatus.ACTIVE, StudentStatus.REPEATING];
    if (!registrationEligibleStatuses.includes(student.status)) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Student status is "${student.status}". Only ACTIVE or officially REPEATING students can register courses.`,
      });
    }

    // A progression evaluation is advisory until a Registrar applies its
    // placement. Registration therefore reads only APPLIED decisions, which
    // makes the operational gate match the auditable placement state machine.
    const appliedPlacement = await this.prisma.academicPlacement.findFirst({
      where: { studentId, status: 'APPLIED', effectiveDate: { lte: new Date() } },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { decision: true, effectiveDate: true },
    });
    if (appliedPlacement?.decision === 'SUSPEND') {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Course registration is blocked by an applied academic suspension effective ${appliedPlacement.effectiveDate.toDateString()}.`,
      });
    }

    // Registration must fail closed when its authoritative period is missing,
    // incomplete, or outside the effective event range.
    await this.assertRegistrationWindow();

    // Load offering details for validation
    const offerings = await this.prisma.courseOffering.findMany({
      where:   { id: { in: dto.courseOfferingIds }, isActive: true },
      include: { course: { include: { prerequisites: true } }, semesterModel: { select: { academicYear: true, semesterNumber: true } } },
    });

    if (offerings.length !== dto.courseOfferingIds.length) {
      throw new BadRequestException('One or more course offerings not found or inactive');
    }
    const notOpen = offerings.filter((offering) => offering.lifecycleStatus && offering.lifecycleStatus !== 'REGISTRATION_OPEN');
    if (notOpen.length) {
      throw new UnprocessableEntityException({
        code: 'COURSE_OFFERING_REGISTRATION_CLOSED',
        message: `Registration is not open for: ${notOpen.map((offering) => offering.course.code).join(', ')}.`,
      });
    }
    const audienceMismatch = offerings.filter((offering) => offering.curriculumVersionId && offering.curriculumVersionId !== student.curriculumVersionId);
    if (audienceMismatch.length) {
      throw new UnprocessableEntityException({
        code: 'COURSE_OFFERING_AUDIENCE_MISMATCH',
        message: `The following offering(s) are scoped to a different curriculum: ${audienceMismatch.map((offering) => offering.course.code).join(', ')}.`,
      });
    }

    const targetYear = offerings[0]!.semesterModel.academicYear;
    const targetSemesterNumber = offerings[0]!.semesterModel.semesterNumber;
    if (offerings.some(o => o.semesterModel.academicYear !== targetYear || o.semesterModel.semesterNumber !== targetSemesterNumber)) {
      throw new BadRequestException('All course offerings in one registration request must belong to the same semester');
    }
    const targetSemester = await this.prisma.semester.findFirst({ where: { academicYear: targetYear, semesterNumber: targetSemesterNumber }, select: { id: true } });
    const feePolicy = (await this.prisma.institutionSettings.findFirst({ select: { feeClearancePolicy: true } }))?.feeClearancePolicy ?? FeeClearancePolicy.SEMESTER_REQUIRED;
    if (feePolicy === FeeClearancePolicy.SEMESTER_REQUIRED) {
      const semesterFees = targetSemester ? await this.prisma.forRequest(this.rlsContext).studentFee.findMany({
        where: { studentId, semesterId: targetSemester.id },
        select: { status: true },
      }) : [];
      if (!targetSemester || semesterFees.length === 0) {
        throw new UnprocessableEntityException({ code: 'SEMESTER_CLEARANCE_REQUIRED', message: 'A semester-specific fee clearance record is required before course registration.' });
      }
      if (semesterFees.some((fee) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(fee.status))) {
        throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_FEE_UNPAID', message: 'Fees must be paid for the selected semester before course registration. Visit the Bursary portal to complete payment.' });
      }
    } else if (feePolicy === FeeClearancePolicy.ANNUAL_CLEARANCE) {
      const annualFees = await this.prisma.forRequest(this.rlsContext).studentFee.findMany({ where: { studentId, academicYear: targetYear }, select: { status: true } });
      if (annualFees.some((fee) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(fee.status)) || (annualFees.length === 0 && !student.feeCleared)) {
        throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_FEE_UNPAID', message: 'Annual fee clearance is required before course registration.' });
      }
    }
    const curriculumCourses = await this.prisma.programmeCourse.findMany({
      where: { curriculumVersionId: student.curriculumVersionId, courseId: { in: offerings.map(o => o.courseId) } },
      select: { courseId: true, level: true, semester: true, isCompulsory: true },
    });
    const allowed = new Set(curriculumCourses.map(c => c.courseId));
    const outside = offerings.filter(o => !allowed.has(o.courseId));
    if (outside.length) {
      throw new UnprocessableEntityException({
        code: 'COURSE_NOT_IN_CURRICULUM',
        message: `The following course(s) are not in the student's assigned curriculum: ${outside.map(o => o.course.code).join(', ')}`,
      });
    }
    // Carryovers are legitimate: a failed course from an earlier level may be
    // retaken when the course is offered. Only the student's assigned
    // curriculum and the current offering determine whether it is selectable.

    // Prerequisite check
    // CB-3 fix: studentResult added in P5 schema.
    // Before P5 migration runs, this returns [] via the catch — students have no
    // passed results, so courses with prerequisites are correctly blocked until
    // actual results exist. This is the safe default (restrictive, not permissive).
    let passedResults: Array<{ courseOffering: { courseId: string }; grade: string; gradePoint: any }> = [];
    try {
      passedResults = await this.prisma.forRequest(this.rlsContext).studentResult.findMany({
        where:  { studentId, status: 'SENATE_PUBLISHED', grade: { notIn: ['F'] } },
        select: { courseOffering: { select: { courseId: true } }, grade: true, gradePoint: true },
      });
    } catch {
      this.logger.debug('studentResult not yet available (P5 migration pending) — prerequisites treated as unmet');
    }
    const passedCourseIds = new Set(passedResults.map((r) => r.courseOffering.courseId));
    const passedByCourse = new Map(passedResults.map((r) => [r.courseOffering.courseId, Number(r.gradePoint)]));

    for (const offering of offerings) {
      for (const prereq of offering.course.prerequisites) {
        const passed = passedCourseIds.has(prereq.prerequisiteId);
        const gradePoint = passedByCourse.get(prereq.prerequisiteId) ?? -1;
        // Nigerian 5-point default ordering: A=5, B=4, C=3, D=2, E=1, F=0.
        // If the prerequisite declares a minimum grade, enforce it rather than
        // merely checking that some non-F attempt exists.
        const minGradePoints: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
        const minimum = minGradePoints[String(prereq.minGrade).toUpperCase()] ?? 1;
        if (!passed || gradePoint < minimum) {
          const prereqCourse = await this.prisma.course.findUnique({
            where: { id: prereq.prerequisiteId }, select: { code: true, title: true },
          });
          throw new UnprocessableEntityException({
            code: 'BUSINESS_RULE_PREREQUISITE',
            message: `Prerequisite not satisfied: ${prereqCourse?.code} (${prereqCourse?.title}) requires at least ${prereq.minGrade}.`,
          });
        }
      }
    }

    const newCU = offerings.reduce((s, o) => s + o.course.creditUnits, 0);

    // P1-2 FIX (this pass — see docs/CHANGELOG.md): the credit-unit
    // read (existingCU), its validation against min/max, AND the actual
    // insert now all happen inside ONE runExclusive() transaction that
    // opens with an advisory lock on studentId — mirroring the same
    // pattern payments.service.ts and results.service.ts use for this
    // exact class of race. AUDIT-C4's original fix (summing existing +
    // new registrations before validating) closed the SEQUENTIAL bypass —
    // call registerCourses twice in a row and the second call correctly
    // sees the first's committed total. It did not close the CONCURRENT
    // version: two calls arriving close together (a plausible real
    // scenario on a slow connection with a double-tapped submit, not just
    // an adversarial one) could each read the same "before" total under
    // READ COMMITTED, each independently pass the check, and both commit —
    // landing the student over the cap with no validation ever having seen
    // the combined total. The lock, acquired before the read, means the
    // second call's read (after the first commits and releases the lock)
    // sees the first call's already-committed registrations, so the
    // combined total is always what gets validated.
    const registered = await this.prisma.runExclusive(this.rlsContext, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId}))`;

      const existingRegs = await tx.courseRegistration.findMany({
        where: {
          studentId, status: CourseRegStatus.REGISTERED,
          courseOffering: { academicYear: targetYear, semesterModel: { semesterNumber: targetSemesterNumber } },
        },
        select: { courseOffering: { select: { course: { select: { creditUnits: true } } } } },
      });
            const existingCU = existingRegs.reduce((s, r) => s + r.courseOffering.course.creditUnits, 0);
      // Capacity is shared across students, so the student lock above is not
      // sufficient: two different students can otherwise both observe the
      // same final seat. Acquire all offering locks in deterministic order to
      // serialize competing registrations without introducing deadlocks for
      // multi-course requests.
      for (const offeringId of offerings.map((offering) => offering.id).sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`course-offering-capacity:${offeringId}`}))`;
      }
      for (const offering of offerings) {
        if (offering.maxStudents == null) continue;
        const enrolledCount = await tx.courseRegistration.count({
          where: {
            courseOfferingId: offering.id,
            // ON_HOLD retains a seat for a temporarily interrupted student;
            // COMPLETED is historical and must not block future registration.
            status: { in: [CourseRegStatus.REGISTERED, CourseRegStatus.ON_HOLD] },
          },
        });
        if (enrolledCount >= offering.maxStudents) {
          throw new UnprocessableEntityException({
            code: 'OFFERING_CAPACITY_REACHED',
            message: `Course ${offering.course.code} is full (${offering.maxStudents} students).`,
          });
        }
      }

      const settings = await tx.institutionSettings.findFirst({
        select: { minCreditUnitsPerSem: true, maxCreditUnitsPerSem: true },
      });
      const minCU   = settings?.minCreditUnitsPerSem ?? 15;
      const maxCU   = settings?.maxCreditUnitsPerSem ?? 24;
      const totalCU = existingCU + newCU;

      if (totalCU < minCU || totalCU > maxCU) {
        throw new UnprocessableEntityException({
          code:    'VALIDATION_ERROR',
          message: `Total credit units for the semester (${existingCU} already registered + ${newCU} in this request = ${totalCU}) must be between ${minCU} and ${maxCU}.`,
        });
      }

      const regs = [];
      for (const offering of offerings) {
        try {
          const reg = await tx.courseRegistration.create({
            data: {
              studentId,
              courseOfferingId: offering.id,
              status:           CourseRegStatus.REGISTERED,
            },
          });
          regs.push(reg);
        } catch (err: unknown) {
          // Prisma unique constraint violation = duplicate registration
          if ((err as { code?: string }).code === 'P2002') {
            throw new ConflictException({
              code:    'DUPLICATE_RESOURCE',
              message: `Already registered for course: ${offering.course.code}`,
            });
          }
          throw err;
        }
      }

      await tx.auditLog.create({
        data: {
          actorId:     actorId,
          action:      AuditAction.CREATE,
          targetTable: 'course_registrations',
          targetId:    studentId,
          newValues:   { courseCount: regs.length, creditUnits: newCU },
        },
      });

      return regs;
    });

    return { registered: registered.length, creditUnits: newCU };
  }

  async dropCourse(studentId: string, courseOfferingId: string, actorId: string) {
    // Validate registration exists
    const db = this.prisma.forRequest(this.rlsContext);
    const reg = await db.courseRegistration.findUnique({
      where: { uq_course_registration: { studentId, courseOfferingId } },
    });
    if (!reg || reg.status !== CourseRegStatus.REGISTERED) {
      throw new BadRequestException('Course registration not found or already dropped');
    }

    // Add/drop uses the same fail-closed authoritative registration window.
    await this.assertRegistrationWindow(new Date(), 'drop');

    await db.courseRegistration.update({
      where: { uq_course_registration: { studentId, courseOfferingId } },
      data:  { status: CourseRegStatus.DROPPED, droppedAt: new Date() },
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'course_registrations', targetId: reg.id,
      oldValues: { status: 'REGISTERED' }, newValues: { status: 'DROPPED' },
    }, actorId);
  }

  async getRegisteredCourses(studentId: string) {
    return this.prisma.forRequest(this.rlsContext).courseRegistration.findMany({
      where:   { studentId, status: CourseRegStatus.REGISTERED },
      include: {
        courseOffering: {
          include: { course: { include: { department: { select: { name: true } } } } },
        },
      },
      orderBy: { registeredAt: 'asc' },
    });
  }

  async getAcademicHistory(studentId: string) {
    return this.prisma.studentAcademicHistory.findMany({
      where:   { studentId },
      orderBy: [{ academicYear: 'desc' }, { level: 'desc' }],
    });
  }

  async updateStatus(id: string, dto: UpdateStudentStatusDto, actorId: string) {
    const db        = this.prisma.forRequest(this.rlsContext);
    const student   = await db.student.findUniqueOrThrow({ where: { id } });
    const transitions: Record<string, StudentStatus[]> = {
      SUSPENDED: [StudentStatus.ACTIVE, StudentStatus.REPEATING],
      DEFERRED: [StudentStatus.ACTIVE, StudentStatus.REPEATING],
      WITHDRAWN: [StudentStatus.ACTIVE, StudentStatus.SUSPENDED, StudentStatus.DEFERRED, StudentStatus.REPEATING],
      REINSTATED: [StudentStatus.SUSPENDED, StudentStatus.DEFERRED],
    };
    const allowedFrom = transitions[dto.action];
    if (!allowedFrom) throw new BadRequestException(`Unknown action: ${dto.action}`);
    if (!allowedFrom.includes(student.status)) throw new ConflictException(`Student status cannot transition from ${student.status} using ${dto.action}.`);
    if (!dto.reason || dto.reason.trim().length < 10) throw new BadRequestException('A reason of at least 10 characters is required for student status changes.');
    let newStatus   = student.status;

    switch (dto.action) {
      case 'SUSPENDED':  newStatus = StudentStatus.SUSPENDED;  break;
      case 'WITHDRAWN':  newStatus = StudentStatus.WITHDRAWN;  break;
      case 'DEFERRED':   newStatus = StudentStatus.DEFERRED;   break;
      case 'REINSTATED': newStatus = StudentStatus.ACTIVE;     break;
      default: throw new BadRequestException(`Unknown action: ${dto.action}`);
    }

    const updated = await db.student.update({ where: { id }, data: { status: newStatus } });
    if (dto.action === 'SUSPENDED' || dto.action === 'DEFERRED') {
      await db.courseRegistration.updateMany({ where: { studentId: id, status: CourseRegStatus.REGISTERED }, data: { status: CourseRegStatus.ON_HOLD } });
      await db.academicPlan.updateMany({ where: { studentId: id, status: 'ACTIVE' }, data: { status: dto.action } });
      await db.degreeAudit.updateMany({ where: { studentId: id, status: { in: ['ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING_REVIEW'] } }, data: { status: 'INVALIDATED' } });
    } else if (dto.action === 'WITHDRAWN') {
      await db.courseRegistration.updateMany({ where: { studentId: id, status: { in: [CourseRegStatus.REGISTERED, CourseRegStatus.ON_HOLD] } }, data: { status: CourseRegStatus.DROPPED } });
      await db.academicPlan.updateMany({ where: { studentId: id, status: { in: ['ACTIVE', 'SUSPENDED', 'DEFERRED'] } }, data: { status: 'WITHDRAWN' } });
      await db.degreeAudit.updateMany({ where: { studentId: id, status: { in: ['ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING_REVIEW'] } }, data: { status: 'INVALIDATED' } });
    } else if (dto.action === 'REINSTATED') {
      await db.courseRegistration.updateMany({
        where: {
          studentId: id,
          status: CourseRegStatus.ON_HOLD,
          courseOffering: { semesterModel: { isCurrent: true, status: { in: ['REGISTRATION', 'ACTIVE', 'EXAMS', 'RESULT_ENTRY'] } } },
        },
        data: { status: CourseRegStatus.REGISTERED },
      });
      await db.academicPlan.updateMany({ where: { studentId: id, status: { in: ['SUSPENDED', 'DEFERRED'] } }, data: { status: 'ACTIVE' } });
    }
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'students', targetId: id,
      oldValues: { status: student.status }, newValues: { status: newStatus, reason: dto.reason },
    }, actorId);
    return updated;
  }

  /** Called by FeesService on payment.completed — marks student fee-cleared */
  async setFeeCleared(studentId: string, cleared: boolean): Promise<void> {
    await this.prisma.forRequest(this.rlsContext).student.update({ where: { id: studentId }, data: { feeCleared: cleared } });
  }

  // ── Graduation ─────────────────────────────────────────────────────────────
  // Deep-audit fix (Aug 2026): this whole section is new. Previously, no
  // code path anywhere in the system ever determined academic completion
  // or set Student.status to GRADUATED — results.service.ts's
  // recomputeAndApplyCgpa() updated the running CGPA but never checked
  // whether a student had actually finished their programme, and
  // AlumniService.createAlumniFromStudent() (itself correctly built) was
  // never called by anything. clearance.service.ts's "eligibleForGraduation"
  // checked administrative sign-off only (fees/library/hostel) — never
  // CGPA, credit units, or courses passed. See
  // docs/CHANGELOG.md finding 1.1 for the full account this
  // fixes.

  /**
   * The academic half of graduation eligibility — CGPA, credit units
   * earned, and required (compulsory) courses passed. Deliberately
   * separate from administrative clearance (fees/library/hostel — see
   * ClearanceService), which is a different, independent condition.
   * "Graduation-eligible" requires both to be true.
   */
  async checkAcademicEligibility(studentId: string, dbOverride?: Prisma.TransactionClient | PrismaService): Promise<{
    eligible: boolean;
    cgpa: number;
    cgpaOk: boolean;
    totalCreditUnitsEarned: number;
    minCreditUnitsRequired: number;
    creditUnitsOk: boolean;
    compulsoryCoursesOk: boolean;
    missingCompulsoryCourses: Array<{ courseId: string; code: string; title: string }>;
  }> {
    const db = dbOverride ?? this.prisma.forRequest(this.rlsContext);
    const student = await db.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { programmeId: true, curriculumVersionId: true, cgpa: true, totalCreditUnitsEarned: true },
    });
    const programme = await db.programme.findUniqueOrThrow({
      where: { id: student.programmeId },
      select: { minCreditUnits: true },
    });

    const compulsoryCourses = await db.programmeCourse.findMany({
      where: { curriculumVersionId: student.curriculumVersionId, isCompulsory: true },
      select: { course: { select: { id: true, code: true, title: true } } },
    });

    // "Passed" mirrors the exact test packages/utils/src/grades.ts's
    // computeCgpa() already uses for counting earned credit units: a
    // SENATE_PUBLISHED result with a grade other than 'F'. An absent/
    // withheld/pending result does not count as passed.
    const passedResults = await db.studentResult.findMany({
      where: { studentId, status: 'SENATE_PUBLISHED', grade: { not: 'F' } },
      select: { courseOffering: { select: { courseId: true } } },
    });
    const passedCourseIds = new Set(passedResults.map((r) => r.courseOffering.courseId));

    const missingCompulsoryCourses = compulsoryCourses
      .filter((pc) => !passedCourseIds.has(pc.course.id))
      .map((pc) => pc.course);

    const cgpa = student.cgpa.toNumber();
    // 1.00 is the same Pass/Fail boundary packages/utils/src/grades.ts's
    // getDegreeClass() already treats as the floor of a completed degree —
    // reused here rather than introducing a second, independent number.
    const cgpaOk = cgpa >= 1.0;
    const creditUnitsOk = student.totalCreditUnitsEarned >= programme.minCreditUnits;
    const compulsoryCoursesOk = missingCompulsoryCourses.length === 0;

    return {
      eligible: cgpaOk && creditUnitsOk && compulsoryCoursesOk,
      cgpa, cgpaOk,
      totalCreditUnitsEarned: student.totalCreditUnitsEarned,
      minCreditUnitsRequired: programme.minCreditUnits,
      creditUnitsOk,
      compulsoryCoursesOk,
      missingCompulsoryCourses: missingCompulsoryCourses.map((c) => ({ courseId: c.id, code: c.code, title: c.title })),
    };
  }

  /**
   * The administrative half — mirrors ClearanceService's own
   * eligibleForGraduation computation exactly (fees/library/hostel/etc.
   * sign-off on every ClearanceItem flagged isRequiredForGraduation).
   * Duplicated here rather than injecting ClearanceService, matching the
   * precedent already set by FeesService's fee-clearance.service.ts, which
   * queries StudentClearance/ClearanceItem directly rather than depending
   * on ClearanceModule — avoids a cross-module dependency for a handful of
   * lines that both sides need to stay in sync on regardless.
   */
  private async checkAdministrativeClearance(studentId: string, dbOverride?: Prisma.TransactionClient | PrismaService): Promise<boolean> {
    const db = dbOverride ?? this.prisma.forRequest(this.rlsContext);
    const [requiredItems, clearances] = await Promise.all([
      db.clearanceItem.findMany({ where: { isActive: true, isRequiredForGraduation: true }, select: { id: true } }),
      db.studentClearance.findMany({ where: { studentId }, select: { status: true, clearanceItemId: true } }),
    ]);
    if (requiredItems.length === 0) return false;
    const byItem = new Map(clearances.map(c => [c.clearanceItemId, c.status]));
    return requiredItems.every(item => byItem.get(item.id) === 'CLEARED');
  }

  async createGraduationCandidate(studentId: string, actorId: string) {
    const academic = await this.checkAcademicEligibility(studentId);
    const administrativelyClear = await this.checkAdministrativeClearance(studentId);
    const db = this.prisma.forRequest(this.rlsContext);
    const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { status: true, curriculumVersionId: true } });
    const latestDegreeAudit = await db.degreeAudit.findFirst({
      where: { studentId, curriculumVersionId: student.curriculumVersionId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });
    if (student.status === StudentStatus.GRADUATED) throw new ConflictException({ code: 'ALREADY_GRADUATED', message: 'Student has already graduated' });

    const semester = await db.semester.findFirst({
      where: { status: { in: ['RESULT_ENTRY', 'COMPLETED'] } },
      orderBy: [{ academicYear: 'desc' }, { semesterNumber: 'desc' }],
      select: { academicYear: true },
    });
    if (!semester) throw new UnprocessableEntityException({ code: 'GRADUATION_PERIOD_REQUIRED', message: 'No completed academic period is available' });

    const degreeAuditEligible = latestDegreeAudit?.status === 'ELIGIBLE';
    const eligible = academic.eligible && degreeAuditEligible && administrativelyClear;
    const snapshot = { academic, degreeAudit: { id: latestDegreeAudit?.id ?? null, status: latestDegreeAudit?.status ?? null }, administrativelyClear, checkedAt: new Date().toISOString() };
    const candidate = await db.graduationCandidate.upsert({
      where: { uq_graduation_candidate_student_year: { studentId, academicYear: semester.academicYear } },
      create: {
        studentId, academicYear: semester.academicYear,
        academicEligible: academic.eligible, administrativeEligible: administrativelyClear,
        auditSnapshot: snapshot,
        status: eligible ? 'DEPARTMENT_RECOMMENDED' : 'ELIGIBILITY_CHECKED',
        recommendedById: eligible ? actorId : null, recommendedAt: eligible ? new Date() : null,
      },
      update: {
        academicEligible: academic.eligible, administrativeEligible: administrativelyClear,
        auditSnapshot: snapshot,
        status: eligible ? 'DEPARTMENT_RECOMMENDED' : 'ELIGIBILITY_CHECKED',
        recommendedById: eligible ? actorId : null, recommendedAt: eligible ? new Date() : null,
        rejectionReason: null,
      },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'graduation_candidates', targetId: candidate.id, newValues: { studentId, academicYear: semester.academicYear, status: candidate.status } }, actorId);
    return candidate;
  }

  async approveGraduation(studentId: string, actorId: string) {
    const db = this.prisma.forRequest(this.rlsContext);
    const candidate = await db.graduationCandidate.findFirst({
      where: { studentId, status: 'DEPARTMENT_RECOMMENDED', academicEligible: true, administrativeEligible: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!candidate) throw new UnprocessableEntityException({ code: 'GRADUATION_APPROVAL_REQUIRED', message: 'Student must first pass the graduation audit and departmental recommendation.' });
    if (candidate.recommendedById === actorId) throw new ForbiddenException({ code: 'SEGREGATION_OF_DUTIES', message: 'The person who recommended a graduation candidate cannot approve the same candidate.' });

    const updated = await db.graduationCandidate.update({
      where: { id: candidate.id },
      data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() },
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'graduation_candidates', targetId: candidate.id, oldValues: { status: candidate.status }, newValues: { status: 'APPROVED', approvedById: actorId } }, actorId);
    return updated;
  }

  async graduate(studentId: string, actorId: string) {
    return this.prisma.runExclusive(this.rlsContext, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`graduation:${studentId}`}))`;

      const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
      if (student.status === StudentStatus.GRADUATED) {
        throw new ConflictException({ code: 'ALREADY_GRADUATED', message: 'Student has already graduated' });
      }

      const candidate = await tx.graduationCandidate.findFirst({
        where: { studentId, status: 'APPROVED', academicEligible: true, administrativeEligible: true },
        orderBy: { approvedAt: 'desc' },
      });
      if (!candidate) throw new UnprocessableEntityException({ code: 'GRADUATION_APPROVAL_REQUIRED', message: 'Graduation must be formally approved before the student can be marked graduated.' });

      const academic = await this.checkAcademicEligibility(studentId, tx);
      const administrativelyClear = await this.checkAdministrativeClearance(studentId, tx);
      const latestDegreeAudit = await tx.degreeAudit.findFirst({
        where: { studentId, curriculumVersionId: student.curriculumVersionId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      });
      if (!academic.eligible || latestDegreeAudit?.status !== 'ELIGIBLE' || !administrativelyClear) throw new UnprocessableEntityException({
        code: 'GRADUATION_NOT_ELIGIBLE',
        message: 'Graduation eligibility changed after approval; a new audit is required.',
        academic, degreeAudit: latestDegreeAudit, administrativelyClear,
      });

      const semester = await tx.semester.findFirst({
        where: { status: { in: ['COMPLETED', 'RESULT_ENTRY'] } },
        orderBy: [{ academicYear: 'desc' }, { semesterNumber: 'desc' }],
      });
      if (!semester) throw new UnprocessableEntityException({ code: 'GRADUATION_PERIOD_REQUIRED', message: 'A completed/result-entry semester is required.' });

      const updated = await tx.student.update({ where: { id: studentId }, data: { status: StudentStatus.GRADUATED } });
      const history = await tx.studentAcademicHistory.findFirst({ where: { studentId, semesterId: semester.id } });
      if (history) {
        await tx.studentAcademicHistory.update({ where: { id: history.id }, data: { status: StudentStatus.GRADUATED, gpa: updated.cgpa, cgpa: updated.cgpa, endDate: new Date() } });
      } else {
        await tx.studentAcademicHistory.create({ data: {
          studentId, semesterId: semester.id, periodKey: `semester:${semester.id}`,
          academicYear: semester.academicYear, level: updated.level, status: StudentStatus.GRADUATED,
          gpa: updated.cgpa, cgpa: updated.cgpa, startDate: semester.classStartDate, endDate: new Date(),
        }});
      }

      const alumniRecord = await this.alumni.createAlumniFromStudent(studentId, updated.userId, tx);
      await tx.graduationCandidate.update({ where: { id: candidate.id }, data: { status: 'GRADUATED' } });
      await this.audit.log({
        action: AuditAction.UPDATE, targetTable: 'students', targetId: studentId,
        oldValues: { status: student.status },
        newValues: { status: StudentStatus.GRADUATED, cgpa: updated.cgpa.toNumber(), degreeClass: getDegreeClass(updated.cgpa.toNumber()) },
      }, actorId);
      await this.outbox.write(tx, 'student.graduated', { type: 'student.graduated', studentId, userId: updated.userId, matricNo: updated.matricNo, cgpa: updated.cgpa.toNumber() });
      return { student: updated, alumni: alumniRecord };
    });
  }
}
