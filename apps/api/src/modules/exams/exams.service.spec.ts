import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SemesterStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { AcademicOfferingAuthorizationService } from '../../common/authorization/academic-offering-authorization.service';
import { PrismaService } from '../../database/prisma.service';
import { ExamsService } from './exams.service';

const makeSemester = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'sem-1', academicYear: '2025/2026', semesterNumber: 1,
  name: 'First Semester 2025/2026', isCurrent: false,
  status: SemesterStatus.PLANNING,
  enrollmentStartDate: new Date('2025-09-01'), enrollmentEndDate: new Date('2025-09-30'),
  classStartDate:      new Date('2025-10-01'), classEndDate:      new Date('2026-01-31'),
  examStartDate:       new Date('2026-02-01'), examEndDate:       new Date('2026-02-28'),
  resultDeadline:      new Date('2026-03-15'),
  createdAt: new Date(), updatedAt: new Date(), ...o,
});

const validDto = {
  academicYear: '2025/2026', semesterNumber: 1, name: 'First Semester 2025/2026',
  enrollmentStartDate: '2025-09-01', enrollmentEndDate: '2025-09-30',
  classStartDate: '2025-10-01', classEndDate: '2026-01-31',
  examStartDate: '2026-02-01', examEndDate: '2026-02-28',
  resultDeadline: '2026-03-15',
};

describe('ExamsService', () => {
  let svc: ExamsService;
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    prisma = {
      semester: {
        create:       jest.fn().mockResolvedValue(makeSemester()),
        findMany:     jest.fn().mockResolvedValue([]),
        findFirst:    jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeSemester()),
        update:       jest.fn().mockResolvedValue(makeSemester()),
        updateMany:   jest.fn().mockResolvedValue({ count: 1 }),
      },
      // P0-12 FIX (this pass — see docs/CHANGELOG.md): missing
      // entirely — setCurrentSemester() calls this.prisma.$transaction(...),
      // and every test reaching that line threw "$transaction is not a
      // function" regardless of environment; this was never a passing
      // test. Invoking the callback with `prisma` itself (not a separate
      // tx mock) means tx.semester.updateMany/update ARE
      // prisma.semester.updateMany/update, so the assertions already
      // written against those keep working unchanged.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      courseOffering: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'co-1', semesterId: 'sem-1' }),
      },
      examVenue: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'venue-1', capacity: 100, active: true }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      courseRegistration: {
        findUnique: jest.fn().mockResolvedValue({ id: 'reg-1', status: 'REGISTERED' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      examTimetable: {
        create:   jest.fn().mockResolvedValue({ id: 'tt-1', venue: 'Hall A', examDate: new Date('2026-02-10'), startTime: '09:00', durationMinutes: 120 }),
        findMany:  jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'tt-1', semesterId: 'sem-1', courseOfferingId: 'co-1', venueId: 'venue-1', venue: 'Hall A', examDate: new Date('2026-02-10'), startTime: '09:00', durationMinutes: 120 }),
        update: jest.fn().mockResolvedValue({ id: 'tt-1', venue: 'Hall A', examDate: new Date('2026-02-12'), startTime: '11:00', durationMinutes: 120 }),
        delete: jest.fn().mockResolvedValue({ id: 'tt-1' }),
      },
      examCandidate: {
        findUnique: jest.fn().mockResolvedValue({ id: 'candidate-1', eligibility: 'ELIGIBLE' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      examAttendance: {
        upsert: jest.fn().mockResolvedValue({ id: 'exam-attendance-1', status: 'PRESENT' }),
        findUnique: jest.fn().mockResolvedValue({ status: 'PRESENT' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      assessmentComponent: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ maxScore: 100, category: 'EXAM', scheme: { courseOfferingId: 'co-1', status: 'ACTIVE' } }),
      },
      assessmentMark: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'exam-mark-1', examTimetableId: 'tt-1', score: 72 }),
      },
      attendanceRecord: {
        upsert:  jest.fn().mockResolvedValue({ id: 'att-1', present: true }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    audit = { log: jest.fn() } as unknown as jest.Mocked<AuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService,  useValue: audit },
        { provide: AcademicOfferingAuthorizationService, useValue: { assertOfferingAccess: jest.fn() } },
      ],
    }).compile();
    svc = module.get<ExamsService>(ExamsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── createSemester() ───────────────────────────────────────────────────────
  describe('createSemester()', () => {
    it('creates semester with valid chronological dates', async () => {
      const result = await svc.createSemester(validDto, 'reg-1');
      expect(result).toBeDefined();
      expect(prisma.semester.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }), 'reg-1');
    });

    it('rejects invalid academic year format', async () => {
      await expect(svc.createSemester({ ...validDto, academicYear: '2025-2026' }, 'reg-1'))
        .rejects.toThrow(BadRequestException);
      expect(prisma.semester.create).not.toHaveBeenCalled();
    });

    it('rejects when enrollment end is before enrollment start', async () => {
      await expect(svc.createSemester({ ...validDto, enrollmentEndDate: '2025-08-01' }, 'reg-1'))
        .rejects.toThrow('Enrollment');
    });

    it('rejects when exam end is before exam start', async () => {
      await expect(svc.createSemester({ ...validDto, examEndDate: '2026-01-01' }, 'reg-1'))
        .rejects.toThrow('Exams');
    });

    it('rejects when result deadline is before exam end', async () => {
      await expect(svc.createSemester({ ...validDto, resultDeadline: '2026-01-01' }, 'reg-1'))
        .rejects.toThrow('Result deadline');
    });
  });

  // ── advanceSemesterStatus() FSM ────────────────────────────────────────────
  describe('advanceSemesterStatus()', () => {
    const flow = ['PLANNING','REGISTRATION','ACTIVE','EXAMS','RESULT_ENTRY','COMPLETED'];

    it.each([
      ['PLANNING',     'REGISTRATION'],
      ['REGISTRATION', 'ACTIVE'],
      ['ACTIVE',       'EXAMS'],
      ['EXAMS',        'RESULT_ENTRY'],
      ['RESULT_ENTRY', 'COMPLETED'],
    ])('advances %s → %s', async (from, to) => {
      prisma.semester.findUniqueOrThrow.mockResolvedValueOnce(makeSemester({ status: from as SemesterStatus }));
      prisma.semester.update.mockResolvedValueOnce(makeSemester({ status: to as SemesterStatus }));
      const updated = await svc.advanceSemesterStatus('sem-1', 'reg-1');
      expect(prisma.semester.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: to },
      }));
    });

    it('throws when already COMPLETED', async () => {
      prisma.semester.findUniqueOrThrow.mockResolvedValueOnce(makeSemester({ status: SemesterStatus.COMPLETED }));
      await expect(svc.advanceSemesterStatus('sem-1', 'reg-1')).rejects.toThrow(BadRequestException);
      expect(prisma.semester.update).not.toHaveBeenCalled();
    });
  });

  // ── setCurrentSemester() ───────────────────────────────────────────────────
  describe('setCurrentSemester()', () => {
    it('deactivates all other semesters before setting the target', async () => {
      // P0-10 FIX (this pass — see docs/CHANGELOG.md): this test
      // relied on the shared default mock (status: PLANNING), but
      // setCurrentSemester() only allows REGISTRATION/ACTIVE semesters to
      // become current — PLANNING correctly gets rejected by the real
      // code, same as the neighboring tests in this file already
      // deliberately override status for their own scenarios. This one
      // never did, so it never actually passed; it was failing for a
      // reason unrelated to what the test name describes.
      prisma.semester.findUniqueOrThrow.mockResolvedValueOnce(makeSemester({ status: SemesterStatus.REGISTRATION }));
      await svc.setCurrentSemester('sem-1', 'reg-1');
      expect(prisma.semester.updateMany).toHaveBeenCalledWith({ where: { isCurrent: true }, data: { isCurrent: false } });
      expect(prisma.semester.update).toHaveBeenCalledWith({ where: { id: 'sem-1' }, data: { isCurrent: true } });
    });
  });

  // ── createTimetableEntry() — venue clash detection ─────────────────────────
  describe('createTimetableEntry()', () => {
    const dto = {
      courseOfferingId: 'co-1', semesterId: 'sem-1', venue: 'Hall A',
      examDate: '2026-02-10', startTime: '09:00', durationMinutes: 120,
    };

    it('creates entry when venue is free at the given time', async () => {
      prisma.examTimetable.findMany.mockResolvedValueOnce([]); // no existing entries
      const entry = await svc.createTimetableEntry(dto, 'reg-1');
      expect(entry.venue).toBe('Hall A');
      expect(prisma.examTimetable.create).toHaveBeenCalled();
    });

    it('throws ConflictException on venue + date + time overlap', async () => {
      // Existing: Hall A, 09:00–11:00. New: Hall A, 10:00–12:00 (overlaps)
      prisma.examTimetable.findMany.mockResolvedValueOnce([{
        id: 'tt-0', venue: 'Hall A', examDate: new Date('2026-02-10'),
        startTime: '09:00', durationMinutes: 120,
      }]);
      await expect(svc.createTimetableEntry({ ...dto, startTime: '10:00' }, 'reg-1'))
        .rejects.toThrow(ConflictException);
      expect(prisma.examTimetable.create).not.toHaveBeenCalled();
    });

    it('allows adjacent (back-to-back) exams in same venue without clash', async () => {
      // Existing: Hall A, 09:00–11:00. New: Hall A, 11:00–13:00 (no overlap)
      prisma.examTimetable.findMany.mockResolvedValueOnce([{
        id: 'tt-0', venue: 'Hall A', examDate: new Date('2026-02-10'),
        startTime: '09:00', durationMinutes: 120,
      }]);
      await svc.createTimetableEntry({ ...dto, startTime: '11:00' }, 'reg-1');
      expect(prisma.examTimetable.create).toHaveBeenCalled();
    });

    it('allows same time in different venues (no clash)', async () => {
      prisma.examTimetable.findMany.mockResolvedValueOnce([]); // different venue returns empty
      await svc.createTimetableEntry({ ...dto, venue: 'Hall B' }, 'reg-1');
      expect(prisma.examTimetable.create).toHaveBeenCalled();
    });
  });

  describe('updateTimetableEntry()', () => {
    it('reschedules an exam after revalidating its slot and capacity', async () => {
      prisma.examTimetable.findUniqueOrThrow.mockResolvedValueOnce({ id: 'tt-1', semesterId: 'sem-1', courseOfferingId: 'co-1', venueId: 'venue-1', venue: 'Hall A', examDate: new Date('2026-02-10'), startTime: '09:00', durationMinutes: 120 });
      prisma.courseRegistration.findMany.mockResolvedValueOnce([{ studentId: 'stu-1' }]).mockResolvedValueOnce([]);
      const result = await svc.updateTimetableEntry('tt-1', { examDate: '2026-02-12', startTime: '11:00' }, 'reg-1');
      expect(result.id).toBe('tt-1');
      expect(prisma.examTimetable.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tt-1' }, data: expect.objectContaining({ startTime: '11:00' }) }));
    });

    it('rejects rescheduling into an occupied venue slot', async () => {
      prisma.examTimetable.findUniqueOrThrow.mockResolvedValueOnce({ id: 'tt-1', semesterId: 'sem-1', courseOfferingId: 'co-1', venueId: 'venue-1', venue: 'Hall A', examDate: new Date('2026-02-10'), startTime: '09:00', durationMinutes: 120 });
      prisma.examTimetable.findMany.mockResolvedValueOnce([{ id: 'other', startTime: '10:00', durationMinutes: 120 }]);
      await expect(svc.updateTimetableEntry('tt-1', { startTime: '11:00' }, 'reg-1')).rejects.toThrow(ConflictException);
      expect(prisma.examTimetable.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelTimetableEntry()', () => {
    it('cancels an unused timetable entry', async () => {
      await expect(svc.cancelTimetableEntry('tt-1', 'reg-1')).resolves.toEqual({ id: 'tt-1' });
      expect(prisma.examTimetable.delete).toHaveBeenCalledWith({ where: { id: 'tt-1' } });
    });

    it('protects examinations with generated candidates', async () => {
      prisma.examCandidate.count.mockResolvedValueOnce(2);
      await expect(svc.cancelTimetableEntry('tt-1', 'reg-1')).rejects.toThrow(ConflictException);
      expect(prisma.examTimetable.delete).not.toHaveBeenCalled();
    });
  });

  describe('bulkRecordExamAttendance()', () => {
    it('records valid rows and reports invalid candidates without aborting the batch', async () => {
      prisma.examCandidate.findMany.mockResolvedValueOnce([{ studentId: 'stu-1', eligibility: 'ELIGIBLE' }]);
      const result = await svc.bulkRecordExamAttendance('tt-1', [{ studentId: 'stu-1', status: 'PRESENT' }, { studentId: 'stu-2', status: 'ABSENT' }], 'staff-1');
      expect(result.recorded).toBe(1);
      expect(result.failed).toBe(1);
      expect(prisma.examAttendance.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordExamMark()', () => {
    it('writes an attendance-gated exam mark with timetable provenance', async () => {
      prisma.examTimetable.findUniqueOrThrow.mockResolvedValueOnce({ courseOfferingId: 'co-1' });
      prisma.examCandidate.findUnique.mockResolvedValueOnce({ eligibility: 'ELIGIBLE' });
      prisma.examAttendance.findUnique.mockResolvedValueOnce({ status: 'PRESENT' });
      const result = await svc.recordExamMark('tt-1', { studentId: 'stu-1', componentId: 'component-exam', score: 72 }, 'staff-1', 'STAFF');
      expect(result).toEqual(expect.objectContaining({ examTimetableId: 'tt-1' }));
      expect(prisma.assessmentMark.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ examTimetableId: 'tt-1', courseOfferingId: 'co-1', componentId: 'component-exam' }),
      }));
    });
  });

  describe('getExamReport()', () => {
    it('returns candidate coverage and attendance percentage', async () => {
      prisma.examTimetable.findUniqueOrThrow.mockResolvedValue({ id: 'tt-1' });
      prisma.examCandidate.findMany.mockResolvedValue([{ eligibility: 'ELIGIBLE' }, { eligibility: 'ELIGIBLE' }, { eligibility: 'INELIGIBLE' }]);
      prisma.examAttendance.findMany.mockResolvedValue([{ status: 'PRESENT' }]);
      const report = await svc.getExamReport('tt-1');
      expect(report.candidates.eligible).toBe(2);
      expect(report.attendance.missing).toBe(1);
      expect(report.attendance.attendancePct).toBe(50);
    });
  });

  // ── recordAttendance() ─────────────────────────────────────────────────────
  describe('recordAttendance()', () => {
    const attDto = {
      studentId: 'stu-1', courseOfferingId: 'co-1', semesterId: 'sem-1',
      date: '2025-10-15', present: true, remark: 'Participated actively',
    };

    it('creates a new attendance record on first call', async () => {
      await svc.recordAttendance(attDto, 'staff-1');
      expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ present: true, recordedById: 'staff-1' }),
      }));
    });

    it('updates existing record on second call (upsert)', async () => {
      await svc.recordAttendance({ ...attDto, present: false }, 'staff-1');
      expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ present: false }),
      }));
    });
  });

  // ── getAttendanceSummary() ────────────────────────────────────────────────
  describe('getAttendanceSummary()', () => {
    it('computes attendance percentage from records', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValueOnce([
        { id: '1', present: true  }, { id: '2', present: true  },
        { id: '3', present: false }, { id: '4', present: true  },
      ]);
      const summary = await svc.getAttendanceSummary('stu-1', 'co-1');
      expect(summary.total).toBe(4);
      expect(summary.present).toBe(3);
      expect(summary.absent).toBe(1);
      expect(summary.attendancePct).toBe(75);
    });

    it('returns 0% attendance for student with no records', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValueOnce([]);
      const summary = await svc.getAttendanceSummary('stu-1', 'co-1');
      expect(summary.attendancePct).toBe(0);
      expect(summary.total).toBe(0);
    });
  });
});
