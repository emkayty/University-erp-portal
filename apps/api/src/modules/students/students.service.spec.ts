import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicantStatus, CalendarStatus, CourseRegStatus, StudentStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../database/prisma.service';
import { RlsContextService } from '../../common/rls/rls-context.service';
import { MatricNumberService } from './matric-number.service';
import { PasswordService } from '../auth/services/password.service';
import { AlumniService } from '../alumni/alumni.service';
import { StudentsService } from './students.service';

const makeStudent = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'stu-1', matricNo: 'CSC/2025/00001', userId: 'user-1',
  firstName: 'Adewale', lastName: 'Ojo', email: 'adewale@test.com',
  phone: '08012345678', programmeId: 'prog-1', departmentId: 'dept-1',
  level: 100, status: StudentStatus.ACTIVE, feeCleared: true,
  cgpa: { toNumber: () => 0 }, totalCreditUnitsEarned: 0, entryAcademicYear: '2025/2026', curriculumVersionId: 'cv-1',
  modeOfStudy: 'FULL_TIME', deletedAt: null,
  createdAt: new Date(), updatedAt: new Date(), ...o,
});

const makeOffering = (id: string, courseId: string, creditUnits: number, prereqs: string[] = []) => ({
  id, courseId, academicYear: '2025/2026', semester: 'FIRST', isActive: true,
  semesterModel: { academicYear: '2025/2026', semesterNumber: 1 },
  course: { id: courseId, code: `CSC${courseId.slice(-3)}`, title: `Course ${id}`,
    creditUnits, prerequisites: prereqs.map((pId) => ({ prerequisiteId: pId })) },
});

const makeActiveCalendar = (withRegWindow = true) => ({
  id: 'cal-1', academicYear: '2025/2026', isActive: true, status: 'ACTIVE',
  events: withRegWindow ? [
    { id: 'ev-1', eventType: 'REGISTRATION_OPEN',  startDate: new Date(Date.now() - 86400_000) },
    { id: 'ev-2', eventType: 'REGISTRATION_CLOSE', startDate: new Date(Date.now() + 86400_000 * 30) },
  ] : [],
});

describe('StudentsService', () => {
  let svc:        StudentsService;
  let prisma:     Record<string, Record<string, jest.Mock>> & { forRequest: jest.Mock; runExclusive: jest.Mock; $executeRaw: jest.Mock };
  let outbox:     jest.Mocked<OutboxService>;
  let audit:      jest.Mocked<AuditService>;
  let matricSvc:  jest.Mocked<MatricNumberService>;
  let passwordSvc: jest.Mocked<PasswordService>;
  let rlsContext: jest.Mocked<RlsContextService>;
  let alumniSvc:  jest.Mocked<AlumniService>;

  beforeEach(async () => {
    prisma = {
      student: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeStudent()),
        findUnique:        jest.fn().mockResolvedValue(makeStudent()),
        findMany:          jest.fn().mockResolvedValue([]),
        create:            jest.fn().mockResolvedValue(makeStudent()),
        update:            jest.fn().mockResolvedValue(makeStudent()),
        count:             jest.fn().mockResolvedValue(0),
      },
      application: { update: jest.fn().mockResolvedValue({ id: 'application-1' }) },
      applicant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'app-1', status: ApplicantStatus.ACCEPTED, email: 'adewale@test.com',
          phone: '08012345678', firstName: 'Adewale', lastName: 'Ojo', middleName: null,
          dateOfBirth: new Date('2003-06-15'), gender: 'Male', nationality: 'Nigerian',
          stateOfOrigin: 'Lagos', nin: null, ninVerified: false, applicationNo: '20250UTME00001', personId: 'person-1',
          student: null,
          application: {
            id: 'application-1',
            offers: [{
              id: 'offer-1', status: 'ACCEPTED', acceptedAt: new Date(), issueDate: new Date(), programmeId: 'prog-1',
              programme: {
                id: 'prog-1', name: 'BSc CS', code: 'CSC-BSC',
                department: { id: 'dept-1', code: 'CSC', name: 'Computer Science', faculty: { id: 'fac-1', name: 'Science' } },
              },
            }],
          },
          programmeChoice1: {
            id: 'prog-1', name: 'BSc CS', code: 'CSC-BSC',
            department: { id: 'dept-1', code: 'CSC', name: 'Computer Science',
              faculty: { id: 'fac-1', name: 'Science' } },
          },
        }),
        update: jest.fn(),
      },
      user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      userRole: {},
      auditLog: { create: jest.fn() },
      clearanceItem: { findMany: jest.fn().mockResolvedValue([]) },
      studentClearance: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      // Deep-audit fix (Aug 2026): added for checkAcademicEligibility()/
      // graduate() — programme minCreditUnits and compulsory-course list.
      programme: { findUniqueOrThrow: jest.fn().mockResolvedValue({ minCreditUnits: 120 }) },
      programmeCourse: { findMany: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve((where.courseId?.in ?? []).map((courseId: string) => ({ courseId }))),
      ) },
      curriculumVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'cv-1', programmeId: 'prog-1', status: 'ACTIVE', version: 1 }) },
      academicCalendar: {
        findFirst: jest.fn().mockResolvedValue(makeActiveCalendar()),
      },
      academicPlacement: { findFirst: jest.fn().mockResolvedValue(null) },
      institutionSettings: {
        findFirst: jest.fn().mockResolvedValue({ minCreditUnitsPerSem: 15, maxCreditUnitsPerSem: 24, requireAdmissionClearance: false, feeClearancePolicy: 'ANNUAL_CLEARANCE' }),
      },
      courseOffering: {
        findMany: jest.fn().mockResolvedValue([
          makeOffering('off-1', 'csc-301', 3),
          makeOffering('off-2', 'csc-302', 3),
          makeOffering('off-3', 'csc-303', 3),
          makeOffering('off-4', 'csc-304', 3),
          makeOffering('off-5', 'csc-305', 3),
        ]),
      },
      studentResult: { findMany: jest.fn().mockResolvedValue([]) },
      course: { findUnique: jest.fn().mockResolvedValue({ code: 'CSC100', title: 'Intro CS' }) },
      courseRegistration: {
        findUnique:  jest.fn().mockResolvedValue(null),
        create:      jest.fn().mockResolvedValue({ id: 'reg-1' }),
        update:      jest.fn(),
        findMany:    jest.fn().mockResolvedValue([]),
        count:       jest.fn().mockResolvedValue(0),
      },
      studentAcademicHistory: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
      graduationCandidate: {
        findFirst: jest.fn().mockResolvedValue({ id: 'grad-1', studentId: 'stu-1', status: 'APPROVED', academicEligible: true, administrativeEligible: true }),
        update: jest.fn().mockResolvedValue({ id: 'grad-1', status: 'GRADUATED' }),
      },
      degreeAudit: { findFirst: jest.fn().mockResolvedValue({ id: 'audit-1', status: 'ELIGIBLE' }) },
      studentFee: { findMany: jest.fn().mockResolvedValue([{ status: 'PAID' }]) },
      semester: { findFirst: jest.fn().mockResolvedValue({ id: 'sem-1', academicYear: '2025/2026', semesterNumber: 2, classStartDate: new Date('2026-01-10'), status: 'COMPLETED' }) },
      // P0-2/P1-2 FIX (this pass — see docs/CHANGELOG.md):
      // StudentsService now calls forRequest()/runExclusive() instead of
      // touching the client or $transaction directly. Both are mocked to
      // hand back `prisma` itself — not a separate fresh mock object like
      // the old $transaction mock built — specifically so every existing
      // per-test override above and below (e.g.
      // `prisma.courseRegistration.findMany.mockResolvedValueOnce(...)`)
      // keeps affecting exactly what the code under test reads, whether it
      // reads through `this.prisma.forRequest(...)` or through the `tx`
      // parameter inside a `runExclusive(...)` callback — both resolve to
      // this same object.
      forRequest:   jest.fn().mockImplementation(() => prisma),
      runExclusive: jest.fn((_rlsContext: unknown, fn: (tx: unknown) => unknown) => fn(prisma)),
      $executeRaw:  jest.fn().mockResolvedValue(1),
    } as never;

    outbox      = { write: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<OutboxService>;
    audit       = { log:  jest.fn() } as unknown as jest.Mocked<AuditService>;
    matricSvc   = { generate: jest.fn().mockResolvedValue('CSC/2025/00001') } as unknown as jest.Mocked<MatricNumberService>;
    passwordSvc = { hash: jest.fn().mockResolvedValue('$2b$12$hash'), validatePasswordStrength: jest.fn().mockReturnValue(null) } as unknown as jest.Mocked<PasswordService>;
    rlsContext  = {} as unknown as jest.Mocked<RlsContextService>; // opaque — only ever passed through to the mocked forRequest/runExclusive above
    // Deep-audit fix (Aug 2026): StudentsService.graduate() now calls
    // AlumniService.createAlumniFromStudent(studentId, userId, tx) — see
    // that method's docblock for why it takes a transaction client. Only
    // graduate()-related tests below actually exercise this mock; every
    // other existing test in this file needs it present purely so
    // Test.createTestingModule(...).compile() can resolve StudentsService's
    // constructor at all.
    alumniSvc   = { createAlumniFromStudent: jest.fn().mockResolvedValue({ id: 'alumni-1' }) } as unknown as jest.Mocked<AlumniService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: PrismaService,      useValue: prisma },
        { provide: OutboxService,      useValue: outbox },
        { provide: AuditService,       useValue: audit },
        { provide: MatricNumberService, useValue: matricSvc },
        { provide: PasswordService,    useValue: passwordSvc },
        { provide: RlsContextService,  useValue: rlsContext },
        { provide: AlumniService,      useValue: alumniSvc },
      ],
    }).compile();

    svc = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── matriculate() ────────────────────────────────────────────────────────────
  describe('matriculate()', () => {
    it('creates student and user records from accepted applicant', async () => {
      const result = await svc.matriculate({ applicantId: 'app-1' }, 'actor');
      expect(result.student.matricNo).toBe('CSC/2025/00001');
      // AUDIT-C1 fix: was emitter.emit('student.registered', ...) — now
      // written to the outbox (atomically inside the matriculation
      // transaction) instead, so NotificationsProcessor actually receives it.
      expect(outbox.write).toHaveBeenCalledWith(
        expect.anything(), 'student.registered', expect.any(Object),
      );
    });

    it('requires CLEARANCE before matriculation when the institutional policy is enabled', async () => {
      prisma.institutionSettings.findFirst.mockResolvedValueOnce({ requireAdmissionClearance: true });
      await expect(svc.matriculate({ applicantId: 'app-1' }, 'actor'))
        .rejects.toMatchObject({ response: expect.objectContaining({ code: 'ADMISSION_CLEARANCE_REQUIRED' }) });
    });

    it('generates matric number via MatricNumberService (advisory lock)', async () => {
      await svc.matriculate({ applicantId: 'app-1' }, 'actor');
      expect(matricSvc.generate).toHaveBeenCalledWith('CSC', '2025', { facultyCode: undefined, programmeCode: 'CSC-BSC' });
    });

    it('rejects if applicant status is not ACCEPTED or CLEARANCE', async () => {
      prisma.applicant.findUniqueOrThrow.mockResolvedValue({
        ...(prisma.applicant.findUniqueOrThrow as jest.Mock).mock.results[0]?.value,
        status: ApplicantStatus.SCREENED,
      });
      // Override mock for this test
      prisma.applicant.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'app-1', status: ApplicantStatus.SCREENED,
        application: { offers: [] },
        programmeChoice1: { id: 'prog-1', department: { id: 'dept-1', code: 'CSC', faculty: { id: 'fac-1' } } },
      });
      await expect(svc.matriculate({ applicantId: 'app-1' }, 'actor'))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('matriculates a cleared applicant using the accepted offer programme', async () => {
      prisma.applicant.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'app-1', status: ApplicantStatus.CLEARANCE, email: 'adewale@test.com',
        phone: '08012345678', firstName: 'Adewale', lastName: 'Ojo', middleName: null,
        dateOfBirth: new Date('2003-06-15'), gender: 'Male', nationality: 'Nigerian',
        applicationNo: '20250UTME00001', personId: 'person-1', student: null,
        application: {
          id: 'application-1',
          offers: [{
            id: 'offer-1', status: 'ACCEPTED', acceptedAt: new Date(), issueDate: new Date(), programmeId: 'prog-2',
            programme: { id: 'prog-2', name: 'BSc Mathematics', code: 'MTH-BSC', department: { id: 'dept-2', code: 'MTH', name: 'Mathematics', faculty: { id: 'fac-1', name: 'Science' } } },
          }],
        },
        programmeChoice1: { id: 'prog-1', name: 'BSc CS', code: 'CSC-BSC', department: { id: 'dept-1', code: 'CSC', name: 'Computer Science', faculty: { id: 'fac-1', name: 'Science' } } },
      });
      prisma.curriculumVersion.findFirst.mockResolvedValueOnce({ id: 'cv-2', programmeId: 'prog-2', status: 'ACTIVE', version: 1 });
      await svc.matriculate({ applicantId: 'app-1' }, 'actor');
      expect(prisma.student.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ programmeId: 'prog-2', departmentId: 'dept-2' }) }));
    });

    it('uses custom entry level when provided', async () => {
      await svc.matriculate({ applicantId: 'app-1', entryLevel: 200 }, 'actor');
      // P0-14 fix (this pass — see docs/CHANGELOG.md): this used to
      // reference prisma.$transaction (renamed to runExclusive as part of
      // the RLS migration) and only checked that SOME callback was passed,
      // never that entryLevel actually reached student.create — so it
      // couldn't have caught a regression in the one thing its name claims
      // to test. Now asserts on the actual create() call args.
      expect(prisma.runExclusive).toHaveBeenCalled();
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ level: 200 }) }),
      );
    });

    it('writes student.registered to the outbox with matricNo and programmeId', async () => {
      await svc.matriculate({ applicantId: 'app-1' }, 'actor');
      expect(outbox.write).toHaveBeenCalledWith(
        expect.anything(),
        'student.registered',
        expect.objectContaining({ matricNo: 'CSC/2025/00001', programmeId: 'prog-1' }),
      );
    });
  });

  // ── registerCourses() ─────────────────────────────────────────────────────────
  describe('registerCourses()', () => {
    const dto = { courseOfferingIds: ['off-1','off-2','off-3','off-4','off-5'], semesterId: 'sem-1' };

    it('registers courses successfully when all guards pass', async () => {
      const result = await svc.registerCourses('stu-1', dto, 'stu-1');
      expect(result.registered).toBe(5);
      expect(result.creditUnits).toBe(15);
    });

    it('rejects registration when the course offering has reached maxStudents', async () => {
      prisma.courseOffering.findMany.mockResolvedValueOnce([
        { ...makeOffering('off-1', 'csc-301', 3), maxStudents: 1 },
        makeOffering('off-2', 'csc-302', 3), makeOffering('off-3', 'csc-303', 3),
        makeOffering('off-4', 'csc-304', 3), makeOffering('off-5', 'csc-305', 3),
      ]);
      prisma.courseRegistration.count.mockResolvedValueOnce(1);
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('Course CSC301 is full');
      expect(prisma.courseRegistration.create).not.toHaveBeenCalled();
      expect(prisma.courseRegistration.count).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ status: { in: [CourseRegStatus.REGISTERED, CourseRegStatus.ON_HOLD] } }),
      }));
    });

    it('locks all offered seats in deterministic order before capacity counts', async () => {
      await svc.registerCourses('stu-1', dto, 'stu-1');
      const capacityKeys = prisma.$executeRaw.mock.calls
        .map(([, key]) => key)
        .filter((key): key is string => typeof key === 'string' && key.startsWith('course-offering-capacity:'));
      expect(capacityKeys).toEqual(['course-offering-capacity:off-1', 'course-offering-capacity:off-2', 'course-offering-capacity:off-3', 'course-offering-capacity:off-4', 'course-offering-capacity:off-5']);
    });

    it('requires a semester fee record when semester clearance policy is enabled', async () => {
      prisma.institutionSettings.findFirst.mockResolvedValue({ minCreditUnitsPerSem: 0, maxCreditUnitsPerSem: 24, requireAdmissionClearance: false, feeClearancePolicy: 'SEMESTER_REQUIRED' });
      prisma.courseOffering.findMany.mockResolvedValueOnce([makeOffering('off-1', 'csc-301', 3)]);
      prisma.studentFee.findMany.mockResolvedValueOnce([]);
      await expect(svc.registerCourses('stu-1', { courseOfferingIds: ['off-1'] }, 'actor'))
        .rejects.toThrow('semester-specific fee clearance');
    });

    it('blocks registration when feeCleared=false and the current year has no fee record', async () => {
      prisma.student.findUniqueOrThrow.mockResolvedValueOnce(makeStudent({ feeCleared: false }));
      prisma.studentFee.findMany.mockResolvedValueOnce([]);
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('Annual fee clearance'); // P0-13 fix: was asserting on the internal `code` field, which NestJS's HttpException.message never contains (verified directly) — see docs/CHANGELOG.md
    });

    it('blocks annual registration when the target year has no fee row even if the legacy flag is true', async () => {
      prisma.studentFee.findMany.mockResolvedValueOnce([]);
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('Annual fee clearance');
    });

    it('blocks registration when student is SUSPENDED', async () => {
      prisma.student.findUniqueOrThrow.mockResolvedValueOnce(makeStudent({ status: StudentStatus.SUSPENDED }));
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('SUSPENDED');
    });

    it('blocks registration when no active calendar', async () => {
      prisma.academicCalendar.findFirst.mockResolvedValueOnce(null);
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('No active academic calendar'); // P0-13 fix — see feeCleared test above
    });

    it('blocks registration when calendar is SUSPENDED (ASUU mode)', async () => {
      prisma.academicCalendar.findFirst.mockResolvedValueOnce({ ...makeActiveCalendar(), status: 'SUSPENDED', isActive: false });
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('No active academic calendar'); // P0-13 fix
    });

    it('blocks registration outside registration window', async () => {
      prisma.academicCalendar.findFirst.mockResolvedValueOnce({
        ...makeActiveCalendar(false),
        events: [
          { id: 'ev-1', eventType: 'REGISTRATION_OPEN',  startDate: new Date(Date.now() + 86400_000 * 10) }, // Opens in future
          { id: 'ev-2', eventType: 'REGISTRATION_CLOSE', startDate: new Date(Date.now() + 86400_000 * 30) },
        ],
      });
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('registration window is closed');
    });

    it('fails closed when an authoritative close event is missing', async () => {
      prisma.academicCalendar.findFirst.mockResolvedValueOnce({
        ...makeActiveCalendar(false),
        events: [{ id: 'ev-1', eventType: 'REGISTRATION_OPEN', startDate: new Date(Date.now() - 86400_000) }],
      });
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('registration window is closed');
    });

    it('honors an explicit registration-open event end date', async () => {
      prisma.academicCalendar.findFirst.mockResolvedValueOnce({
        ...makeActiveCalendar(false),
        events: [
          { id: 'ev-1', eventType: 'REGISTRATION_OPEN', startDate: new Date(Date.now() - 86400_000 * 3), endDate: new Date(Date.now() - 86400_000) },
          { id: 'ev-2', eventType: 'REGISTRATION_CLOSE', startDate: new Date(Date.now() + 86400_000 * 30) },
        ],
      });
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('registration window is closed');
    });

    it('rejects when total credit units exceed maximum (24)', async () => {
      // 5 courses × 6 CU = 30 (exceeds max 24)
      prisma.courseOffering.findMany.mockResolvedValueOnce([
        makeOffering('off-1','csc-301',6), makeOffering('off-2','csc-302',6),
        makeOffering('off-3','csc-303',6), makeOffering('off-4','csc-304',6),
        makeOffering('off-5','csc-305',6),
      ]);
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('credit units');
    });

    it('rejects when total credit units below minimum (15)', async () => {
      // 1 course × 2 CU = 2 (below min 15)
      prisma.courseOffering.findMany.mockResolvedValueOnce([makeOffering('off-1','csc-301',2)]);
      await expect(svc.registerCourses('stu-1', { courseOfferingIds: ['off-1'], semesterId: 'sem-1' }, 'stu-1'))
        .rejects.toThrow('credit units');
    });

    // ── AUDIT-C4: previously only checked the CURRENT request's offerings,
    // ignoring anything already registered this semester ──────────────────
    describe('credit-limit accounts for existing registrations (AUDIT-C4)', () => {
      it('rejects a second registration call that would push the semester total over the max', async () => {
        // Student already has 21 CU registered this semester (7×3CU courses)
        prisma.courseRegistration.findMany.mockResolvedValueOnce(
          Array(7).fill({ courseOffering: { course: { creditUnits: 3 } } }),
        );
        // This request alone is only 6 CU (2×3CU) — would pass MIN/MAX in
        // isolation, but 21+6=27 exceeds the 24 cap.
        prisma.courseOffering.findMany.mockResolvedValueOnce([
          makeOffering('off-1', 'csc-401', 3), makeOffering('off-2', 'csc-402', 3),
        ]);
        await expect(svc.registerCourses('stu-1', { courseOfferingIds: ['off-1', 'off-2'], semesterId: 'sem-1' }, 'stu-1'))
          .rejects.toThrow('credit units');
      });

      it('allows a small top-up registration that would fail the minimum ALONE but is fine combined with existing registrations', async () => {
        // Student already has 15 CU registered (5×3CU) — meets the minimum by itself
        prisma.courseRegistration.findMany.mockResolvedValueOnce(
          Array(5).fill({ courseOffering: { course: { creditUnits: 3 } } }),
        );
        // Adding one more 3-unit elective — 3 CU alone would fail the
        // 15-unit minimum under the OLD (buggy) check, but 15+3=18 is valid.
        prisma.courseOffering.findMany.mockResolvedValueOnce([makeOffering('off-1', 'csc-499', 3)]);
        const result = await svc.registerCourses('stu-1', { courseOfferingIds: ['off-1'], semesterId: 'sem-1' }, 'stu-1');
        expect(result.registered).toBe(1);
      });

      it('rejects mixing offerings from two different semesters in one request', async () => {
        prisma.courseOffering.findMany.mockResolvedValueOnce([
          makeOffering('off-1', 'csc-301', 3),
          { ...makeOffering('off-2', 'csc-302', 3), semester: 'SECOND', semesterModel: { academicYear: '2025/2026', semesterNumber: 2 } },
        ]);
        await expect(svc.registerCourses('stu-1', { courseOfferingIds: ['off-1', 'off-2'], semesterId: 'sem-1' }, 'stu-1'))
          .rejects.toThrow('same semester');
      });
    });

    it('blocks if prerequisite not satisfied', async () => {
      prisma.courseOffering.findMany.mockResolvedValueOnce([
        makeOffering('off-1','csc-301',3,[]),
        makeOffering('off-2','csc-302',3,[]),
        makeOffering('off-3','csc-303',3,[]),
        makeOffering('off-4','csc-304',3,[]),
        makeOffering('off-5','csc-305',3,['csc-100']), // requires CSC100 not yet passed
      ]);
      prisma.studentResult.findMany.mockResolvedValueOnce([]); // No passed courses
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('Prerequisite not satisfied'); // P0-13 fix
    });

    it('allows registration when prerequisite is already satisfied', async () => {
      prisma.courseOffering.findMany.mockResolvedValueOnce([
        makeOffering('off-1','csc-301',3,[]),
        makeOffering('off-2','csc-302',3,[]),
        makeOffering('off-3','csc-303',3,[]),
        makeOffering('off-4','csc-304',3,[]),
        makeOffering('off-5','csc-305',3,['csc-100']),
      ]);
      // Student has passed csc-100
      prisma.studentResult.findMany.mockResolvedValueOnce([
        { courseOffering: { courseId: 'csc-100' }, grade: 'A', gradePoint: { toNumber: () => 5 } },
      ]);
      const result = await svc.registerCourses('stu-1', dto, 'stu-1');
      expect(result.registered).toBe(5);
    });

    it('does not treat ABS as a satisfied prerequisite', async () => {
      prisma.courseOffering.findMany.mockResolvedValueOnce([
        makeOffering('off-1','csc-301',3,[]),
        makeOffering('off-2','csc-302',3,[]),
        makeOffering('off-3','csc-303',3,[]),
        makeOffering('off-4','csc-304',3,[]),
        makeOffering('off-5','csc-305',3,['csc-100']),
      ]);
      prisma.studentResult.findMany.mockResolvedValueOnce([
        { courseOffering: { courseId: 'csc-100' }, grade: 'ABS', gradePoint: { toNumber: () => 0 } },
      ]);
      await expect(svc.registerCourses('stu-1', dto, 'stu-1'))
        .rejects.toThrow('Prerequisite not satisfied');
    });

    // ── P1-2 FIX: course-registration credit-limit advisory lock (this
    //    pass — see docs/CHANGELOG.md) ─────────────────────────────
    // Same caveat as results.service.spec.ts's P1-1 tests: this can't spin
    // up two literal concurrent Postgres connections in a Jest unit test.
    // What it CAN and does prove: the lock is actually issued, keyed on
    // studentId, and acquired before the existing-registrations read it's
    // meant to protect — the exact ordering that makes it effective.
    describe('P1-2: credit-limit advisory lock', () => {
      it('acquires pg_advisory_xact_lock(hashtext(studentId)) before reading existing registrations', async () => {
        const callOrder: string[] = [];
        prisma.$executeRaw.mockImplementation((strings: TemplateStringsArray) => {
          if (strings.join('').includes('pg_advisory_xact_lock')) callOrder.push('lock');
          return Promise.resolve(1);
        });
        prisma.courseRegistration.findMany.mockImplementation(() => {
          callOrder.push('credit-read');
          return Promise.resolve([]);
        });

        await svc.registerCourses('stu-1', dto, 'stu-1');

        expect(prisma.$executeRaw).toHaveBeenCalled();
        const [strings, key] = prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray, string];
        expect(strings.join('')).toContain('pg_advisory_xact_lock(hashtext(');
        expect(key).toBe('stu-1');
        expect(callOrder.slice(0, 2)).toEqual(['lock', 'credit-read']);
        expect(callOrder.filter((entry) => entry === 'lock')).toHaveLength(6);
      });

      it('locks on the studentId passed in, not a fixed key', async () => {
        await svc.registerCourses('stu-42', dto, 'stu-42');
        const [, key] = prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray, string];
        expect(key).toBe('stu-42');
      });
    });
  });

  // ── dropCourse() ──────────────────────────────────────────────────────────────
  describe('dropCourse()', () => {
    it('drops a registered course within the add/drop window', async () => {
      prisma.courseRegistration.findUnique.mockResolvedValueOnce({ id: 'reg-1', status: CourseRegStatus.REGISTERED });
      await svc.dropCourse('stu-1', 'off-1', 'stu-1');
      expect(prisma.courseRegistration.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: CourseRegStatus.DROPPED }),
      }));
    });

    it('blocks drop after add/drop window closes', async () => {
      prisma.courseRegistration.findUnique.mockResolvedValueOnce({ id: 'reg-1', status: CourseRegStatus.REGISTERED });
      prisma.academicCalendar.findFirst.mockResolvedValueOnce({
        ...makeActiveCalendar(false),
        events: [
          { id: 'ev-1', eventType: 'REGISTRATION_OPEN',  startDate: new Date(Date.now() - 86400_000 * 30) },
          { id: 'ev-2', eventType: 'REGISTRATION_CLOSE', startDate: new Date(Date.now() - 86400_000 * 7) }, // Closed 7 days ago
        ],
      });
      await expect(svc.dropCourse('stu-1', 'off-1', 'stu-1'))
        .rejects.toThrow('add/drop window has closed');
    });
  });

  // ── checkAcademicEligibility() / graduate() (deep-audit fix, Aug 2026) ─────
  describe('checkAcademicEligibility()', () => {
    const decimal = (n: number) => ({ toNumber: () => n });

    it('is eligible when CGPA >= 1.00, credit units met, and no compulsory course is missing', async () => {
      prisma.student.findUniqueOrThrow.mockResolvedValueOnce(
        makeStudent({ programmeId: 'prog-1', cgpa: decimal(3.5), totalCreditUnitsEarned: 130 }));
      prisma.programme.findUniqueOrThrow.mockResolvedValueOnce({ minCreditUnits: 120 });
      prisma.programmeCourse.findMany.mockResolvedValueOnce([
        { course: { id: 'c1', code: 'CSC101', title: 'Intro to CS' } },
      ]);
      prisma.studentResult.findMany.mockResolvedValueOnce([
        { courseOffering: { courseId: 'c1' }, grade: 'A', gradePoint: decimal(5) },
      ]);

      const result = await svc.checkAcademicEligibility('stu-1');
      expect(result.eligible).toBe(true);
      expect(result.cgpaOk).toBe(true);
      expect(result.creditUnitsOk).toBe(true);
      expect(result.compulsoryCoursesOk).toBe(true);
      expect(result.missingCompulsoryCourses).toHaveLength(0);
    });

    it('is not eligible when CGPA is below 1.00 (the same Pass/Fail floor grades.ts uses)', async () => {
      prisma.student.findUniqueOrThrow.mockResolvedValueOnce(
        makeStudent({ cgpa: decimal(0.85), totalCreditUnitsEarned: 130 }));
      prisma.programme.findUniqueOrThrow.mockResolvedValueOnce({ minCreditUnits: 120 });

      const result = await svc.checkAcademicEligibility('stu-1');
      expect(result.eligible).toBe(false);
      expect(result.cgpaOk).toBe(false);
    });

    it('is not eligible when total credit units earned is below the programme minimum', async () => {
      prisma.student.findUniqueOrThrow.mockResolvedValueOnce(
        makeStudent({ cgpa: decimal(3.0), totalCreditUnitsEarned: 90 }));
      prisma.programme.findUniqueOrThrow.mockResolvedValueOnce({ minCreditUnits: 120 });

      const result = await svc.checkAcademicEligibility('stu-1');
      expect(result.eligible).toBe(false);
      expect(result.creditUnitsOk).toBe(false);
    });

    it('is not eligible when a compulsory course was never passed', async () => {
      prisma.student.findUniqueOrThrow.mockResolvedValueOnce(
        makeStudent({ cgpa: decimal(3.5), totalCreditUnitsEarned: 130 }));
      prisma.programme.findUniqueOrThrow.mockResolvedValueOnce({ minCreditUnits: 120 });
      prisma.programmeCourse.findMany.mockResolvedValueOnce([
        { course: { id: 'c1', code: 'CSC101', title: 'Intro to CS' } },
        { course: { id: 'c2', code: 'CSC201', title: 'Data Structures' } },
      ]);
      // Only c1 was passed — c2 (compulsory) is missing.
      prisma.studentResult.findMany.mockResolvedValueOnce([
        { courseOffering: { courseId: 'c1' }, grade: 'A', gradePoint: decimal(5) },
      ]);

      const result = await svc.checkAcademicEligibility('stu-1');
      expect(result.eligible).toBe(false);
      expect(result.compulsoryCoursesOk).toBe(false);
      expect(result.missingCompulsoryCourses).toEqual([{ courseId: 'c2', code: 'CSC201', title: 'Data Structures' }]);
    });

    it('does not treat ABS as passing a compulsory course', async () => {
      prisma.student.findUniqueOrThrow.mockResolvedValueOnce(
        makeStudent({ programmeId: 'prog-1', cgpa: decimal(3.5), totalCreditUnitsEarned: 130 }));
      prisma.programme.findUniqueOrThrow.mockResolvedValueOnce({ minCreditUnits: 120 });
      prisma.programmeCourse.findMany.mockResolvedValueOnce([
        { course: { id: 'c1', code: 'CSC101', title: 'Intro to CS' } },
      ]);
      prisma.studentResult.findMany.mockResolvedValueOnce([
        { courseOffering: { courseId: 'c1' }, grade: 'ABS', gradePoint: decimal(0) },
      ]);

      const result = await svc.checkAcademicEligibility('stu-1');
      expect(result.eligible).toBe(false);
      expect(result.compulsoryCoursesOk).toBe(false);
      expect(result.missingCompulsoryCourses).toEqual([{ courseId: 'c1', code: 'CSC101', title: 'Intro to CS' }]);
    });
  });

  describe('graduate()', () => {
    const decimal = (n: number) => ({ toNumber: () => n });
    const mockEligible = () => {
      prisma.student.findUniqueOrThrow.mockResolvedValue(
        makeStudent({ cgpa: decimal(3.5), totalCreditUnitsEarned: 130, status: StudentStatus.ACTIVE }));
      prisma.programme.findUniqueOrThrow.mockResolvedValueOnce({ minCreditUnits: 120 });
      prisma.programmeCourse.findMany.mockResolvedValueOnce([]);
      prisma.studentResult.findMany.mockResolvedValueOnce([]);
      prisma.clearanceItem.findMany.mockResolvedValueOnce([{ id: 'clearance-1' }]);
      prisma.studentClearance.findMany.mockResolvedValueOnce([
        { status: 'CLEARED', clearanceItemId: 'clearance-1' },
      ]);
    };

    it('rejects with GRADUATION_NOT_ELIGIBLE when academic requirements are not met, without touching the DB write path', async () => {
      prisma.student.findUniqueOrThrow.mockResolvedValueOnce(
        makeStudent({ cgpa: decimal(0.5), totalCreditUnitsEarned: 130 })); // fails CGPA
      prisma.programme.findUniqueOrThrow.mockResolvedValueOnce({ minCreditUnits: 120 });

      await expect(svc.graduate('stu-1', 'actor')).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.runExclusive).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('rejects with GRADUATION_NOT_ELIGIBLE when academically eligible but administratively not cleared', async () => {
      prisma.student.findUniqueOrThrow.mockResolvedValueOnce(
        makeStudent({ cgpa: decimal(3.5), totalCreditUnitsEarned: 130 }));
      prisma.programme.findUniqueOrThrow.mockResolvedValueOnce({ minCreditUnits: 120 });
      prisma.programmeCourse.findMany.mockResolvedValueOnce([]);
      prisma.studentResult.findMany.mockResolvedValueOnce([]);
      prisma.studentClearance.findMany.mockResolvedValueOnce([
        { status: 'PENDING', clearanceItem: { isRequiredForGraduation: true } },
      ]);

      await expect(svc.graduate('stu-1', 'actor')).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.runExclusive).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('rejects with ConflictException if the student has already graduated', async () => {
      mockEligible();
      // Deep-audit note on this test itself: checkAcademicEligibility()
      // only ever `select`s programmeId/cgpa/totalCreditUnitsEarned — it
      // never reads `status` — so it's safe for every findUniqueOrThrow
      // call in this test to resolve to the SAME already-graduated object
      // (via the persistent mockResolvedValue, not a fragile
      // mockResolvedValueOnce that would depend on exactly which of the
      // two Promise.all-parallel calls happens to consume it first).
      prisma.student.findUniqueOrThrow.mockResolvedValue(
        makeStudent({ cgpa: decimal(3.5), totalCreditUnitsEarned: 130, status: StudentStatus.GRADUATED }));

      await expect(svc.graduate('stu-1', 'actor')).rejects.toThrow(ConflictException);
    });

    it('on success: flips status to GRADUATED and calls AlumniService.createAlumniFromStudent WITH the transaction client (not the ambient one)', async () => {
      mockEligible();
      prisma.student.update.mockResolvedValueOnce(
        makeStudent({ status: StudentStatus.GRADUATED, cgpa: decimal(3.5), userId: 'user-1', matricNo: 'CSC/2025/00001' }));

      const result = await svc.graduate('stu-1', 'actor');

      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 'stu-1' }, data: { status: StudentStatus.GRADUATED },
      });
      // Deep-audit fix under test: this MUST be the `tx` runExclusive() /
      // $transaction hands the callback (here, the mocked `prisma` itself —
      // see the forRequest/runExclusive mock setup above) — not some other
      // object — or the alumni row created inside it would silently fall
      // outside this transaction's atomicity, exactly the bug that was
      // found and fixed.
      expect(alumniSvc.createAlumniFromStudent).toHaveBeenCalledWith('stu-1', 'user-1', prisma);
      expect(outbox.write).toHaveBeenCalledWith(prisma, 'student.graduated', expect.objectContaining({
        studentId: 'stu-1', userId: 'user-1',
      }));
      expect(result.student.status).toBe(StudentStatus.GRADUATED);
    });
  });
});
