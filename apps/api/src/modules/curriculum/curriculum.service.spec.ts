import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { CurriculumService } from './curriculum.service';

// ── Test helpers ──────────────────────────────────────────────────────────────
const makeCourse = (id: string, code: string, cu = 3, cat = 'CORE') => ({
  id, code, title: `Course ${code}`, creditUnits: cu,
  departmentId: 'dept-1', ccmasCategory: cat, isActive: true,
  description: null, createdAt: new Date(), updatedAt: new Date(),
});

const makePrereqEdge = (courseId: string, prerequisiteId: string) => ({ courseId, prerequisiteId });

describe('CurriculumService', () => {
  let svc:   CurriculumService;
  let prisma: {
    faculty:            Record<string, jest.Mock>;
    department:         Record<string, jest.Mock>;
    programme:          Record<string, jest.Mock>;
    programmeCourse:    Record<string, jest.Mock>;
    course:             Record<string, jest.Mock>;
    coursePrerequisite: Record<string, jest.Mock>;
    courseOffering:     Record<string, jest.Mock>;
    academicCalendar:   Record<string, jest.Mock>;
  };
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    prisma = {
      faculty:            { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      department:         { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      programme:          { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      programmeCourse:    { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
      course:             { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      coursePrerequisite: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
      courseOffering:     { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      academicCalendar:   { findUniqueOrThrow: jest.fn() },
    };
    audit = { log: jest.fn() } as unknown as jest.Mocked<AuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurriculumService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService,  useValue: audit },
      ],
    }).compile();

    svc = module.get<CurriculumService>(CurriculumService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── createFaculty() ──────────────────────────────────────────────────────
  describe('createFaculty()', () => {
    it('uppercases faculty code', async () => {
      prisma.faculty.create.mockResolvedValue({ id: 'f1', name: 'Science', code: 'FSC', isActive: true, createdAt: new Date(), updatedAt: new Date() });
      await svc.createFaculty({ name: 'Science', code: 'fsc' }, 'actor');
      expect(prisma.faculty.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'FSC' }) }),
      );
    });
  });

  // ── addPrerequisite() — DAG cycle detection ───────────────────────────────
  describe('addPrerequisite() — cycle detection', () => {
    it('allows a valid linear prerequisite chain A → B → C (adding C requires B)', async () => {
      // Existing: B requires A (B → A)
      prisma.coursePrerequisite.findMany.mockResolvedValue([
        makePrereqEdge('B', 'A'),
      ]);
      prisma.course.findUniqueOrThrow.mockResolvedValue(makeCourse('C', 'CSC303'));
      prisma.coursePrerequisite.create.mockResolvedValue({ id: 'pr1', courseId: 'C', prerequisiteId: 'B', minGrade: 'E' });

      // Adding: C requires B (C → B) — no cycle: A ← B ← C
      await expect(svc.addPrerequisite('C', { prerequisiteId: 'B' }, 'actor')).resolves.not.toThrow();
    });

    it('rejects direct self-reference (course requires itself)', async () => {
      await expect(svc.addPrerequisite('A', { prerequisiteId: 'A' }, 'actor'))
        .rejects.toThrow(BadRequestException);
      expect(prisma.coursePrerequisite.create).not.toHaveBeenCalled();
    });

    it('rejects direct cycle: A requires B, adding B requires A', async () => {
      // Existing: A requires B (A → B)
      prisma.coursePrerequisite.findMany.mockResolvedValue([
        makePrereqEdge('A', 'B'),
      ]);
      prisma.course.findUniqueOrThrow.mockResolvedValue(makeCourse('B', 'CSC302'));

      // Adding: B requires A would create cycle A → B → A
      await expect(svc.addPrerequisite('B', { prerequisiteId: 'A' }, 'actor'))
        .rejects.toThrow(UnprocessableEntityException);
      expect(prisma.coursePrerequisite.create).not.toHaveBeenCalled();
    });

    it('rejects transitive cycle: A→B→C, adding C→A', async () => {
      // Existing: A→B, B→C
      prisma.coursePrerequisite.findMany.mockResolvedValue([
        makePrereqEdge('A', 'B'),
        makePrereqEdge('B', 'C'),
      ]);
      prisma.course.findUniqueOrThrow.mockResolvedValue(makeCourse('C', 'CSC303'));

      // Adding C→A would create A→B→C→A
      await expect(svc.addPrerequisite('C', { prerequisiteId: 'A' }, 'actor'))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects 4-node cycle: A→B→C→D, adding D→A', async () => {
      prisma.coursePrerequisite.findMany.mockResolvedValue([
        makePrereqEdge('A', 'B'),
        makePrereqEdge('B', 'C'),
        makePrereqEdge('C', 'D'),
      ]);
      prisma.course.findUniqueOrThrow.mockResolvedValue(makeCourse('D', 'CSC304'));

      await expect(svc.addPrerequisite('D', { prerequisiteId: 'A' }, 'actor'))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('allows diamond dependency (no cycle): A→B, A→C, B→D, C→D', async () => {
      // D requires both B and C; B and C both require A — diamond, no cycle
      prisma.coursePrerequisite.findMany.mockResolvedValue([
        makePrereqEdge('B', 'A'),
        makePrereqEdge('C', 'A'),
        makePrereqEdge('D', 'B'),
      ]);
      prisma.course.findUniqueOrThrow.mockResolvedValue(makeCourse('D', 'CSC304'));
      prisma.coursePrerequisite.create.mockResolvedValue({ id: 'pr1', courseId: 'D', prerequisiteId: 'C', minGrade: 'E' });

      // Adding D→C: D now requires both B and C — valid diamond
      await expect(svc.addPrerequisite('D', { prerequisiteId: 'C' }, 'actor')).resolves.not.toThrow();
    });

    it('does not create DB entry if cycle detected', async () => {
      prisma.coursePrerequisite.findMany.mockResolvedValue([makePrereqEdge('A', 'B')]);
      prisma.course.findUniqueOrThrow.mockResolvedValue(makeCourse('B', 'CSC302'));

      await expect(svc.addPrerequisite('B', { prerequisiteId: 'A' }, 'actor')).rejects.toThrow();
      expect(prisma.coursePrerequisite.create).not.toHaveBeenCalled();
    });
  });

  // ── updateCourse() — credit unit freeze ──────────────────────────────────
  describe('updateCourse()', () => {
    it('rejects credit unit change on existing course', async () => {
      prisma.course.findUniqueOrThrow.mockResolvedValue(makeCourse('c1', 'CSC301', 3));

      await expect(svc.updateCourse('c1', { creditUnits: 4 } as never, 'actor'))
        .rejects.toThrow(BadRequestException);
      expect(prisma.course.update).not.toHaveBeenCalled();
    });

    it('allows non-credit-unit updates', async () => {
      prisma.course.findUniqueOrThrow.mockResolvedValue(makeCourse('c1', 'CSC301', 3));
      prisma.course.update.mockResolvedValue(makeCourse('c1', 'CSC301', 3));

      await expect(svc.updateCourse('c1', { title: 'Advanced Algorithms' }, 'actor')).resolves.not.toThrow();
      expect(prisma.course.update).toHaveBeenCalled();
    });
  });

  // ── createProgramme() — credit unit validation ────────────────────────────
  describe('createProgramme()', () => {
    it('rejects when minCreditUnits >= maxCreditUnits', async () => {
      prisma.department.findUniqueOrThrow.mockResolvedValue({ id: 'dept-1' });
      await expect(svc.createProgramme({
        name: 'BSc CS', code: 'CSC-BSC', departmentId: 'dept-1',
        degreeType: 'BSC', durationYears: 4,
        minCreditUnits: 180, maxCreditUnits: 120,
      }, 'actor')).rejects.toThrow(BadRequestException);
    });

    it('uses default min/max when not provided', async () => {
      prisma.department.findUniqueOrThrow.mockResolvedValue({ id: 'dept-1' });
      prisma.programme.create.mockResolvedValue({ id: 'p1', code: 'CSC-BSC', name: 'BSc CS' });

      await svc.createProgramme({
        name: 'BSc CS', code: 'CSC-BSC', departmentId: 'dept-1',
        degreeType: 'BSC', durationYears: 4,
      }, 'actor');

      expect(prisma.programme.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ minCreditUnits: 120, maxCreditUnits: 180 }),
      }));
    });
  });

  // ── getCcmasCompliance() ──────────────────────────────────────────────────
  describe('getCcmasCompliance()', () => {
    it('marks a programme as compliant when core >= 70%', async () => {
      prisma.programme.findMany.mockResolvedValue([{
        id: 'p1', name: 'BSc CS', code: 'CSC-BSC',
        programmeCourses: [
          { ccmasCategory: 'CORE', course: { creditUnits: 7 } }, // 70%
          { ccmasCategory: 'ELECTIVE', course: { creditUnits: 2 } }, // 20%
          { ccmasCategory: 'GENERAL_STUDIES', course: { creditUnits: 1 } }, // 10%
        ],
      }]);
      const result = await svc.getCcmasCompliance();
      expect(result[0]!.corePct).toBe(70);
      expect(result[0]!.isCompliant).toBe(true);
    });

    it('marks a programme as non-compliant when core < 70%', async () => {
      prisma.programme.findMany.mockResolvedValue([{
        id: 'p2', name: 'BSc Art', code: 'ART-BSC',
        programmeCourses: [
          { ccmasCategory: 'CORE', course: { creditUnits: 6 } }, // 60%
          { ccmasCategory: 'ELECTIVE', course: { creditUnits: 4 } }, // 40%
        ],
      }]);
      const result = await svc.getCcmasCompliance();
      expect(result[0]!.corePct).toBe(60);
      expect(result[0]!.isCompliant).toBe(false);
    });

    it('returns 0% for programmes with no mapped courses', async () => {
      prisma.programme.findMany.mockResolvedValue([{
        id: 'p3', name: 'Empty Prog', code: 'EMP-BSC',
        programmeCourses: [],
      }]);
      const result = await svc.getCcmasCompliance();
      expect(result[0]!.totalUnits).toBe(0);
      expect(result[0]!.corePct).toBe(0);
      expect(result[0]!.isCompliant).toBe(false);
    });

    it('correctly separates CORE, ELECTIVE, GENERAL_STUDIES units', async () => {
      prisma.programme.findMany.mockResolvedValue([{
        id: 'p4', name: 'Test', code: 'TST',
        programmeCourses: [
          { ccmasCategory: 'CORE', course: { creditUnits: 70 } },
          { ccmasCategory: 'ELECTIVE', course: { creditUnits: 20 } },
          { ccmasCategory: 'GENERAL_STUDIES', course: { creditUnits: 10 } },
        ],
      }]);
      const [r] = await svc.getCcmasCompliance();
      expect(r!.coreUnits).toBe(70);
      expect(r!.electiveUnits).toBe(20);
      expect(r!.generalUnits).toBe(10);
      expect(r!.totalUnits).toBe(100);
    });
  });
});
