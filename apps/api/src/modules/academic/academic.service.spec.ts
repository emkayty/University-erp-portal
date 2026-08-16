import { StudentStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { RlsContextService } from '../../common/rls/rls-context.service';
import { PrismaService } from '../../database/prisma.service';
import { AcademicService } from './academic.service';

const NOW = new Date('2026-08-14T10:00:00.000Z');

function makeStudent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'student-1',
    programmeId: 'programme-1',
    curriculumVersionId: 'curriculum-1',
    level: 200,
    cgpa: 2.5,
    entryAcademicYear: '2024/2025',
    programme: {
      id: 'programme-1',
      minCreditUnits: 120,
      departmentId: 'department-1',
      department: { facultyId: 'faculty-1', faculty: { id: 'faculty-1' } },
    },
    curriculumVersion: { id: 'curriculum-1' },
    results: [],
    academicHistory: [{
      id: 'history-1',
      academicYear: '2025/2026',
      creditUnitsAttempted: 18,
      creditUnitsEarned: 18,
      gpa: 2.5,
      cgpa: 2.5,
      failedCourseCount: 0,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-07-01'),
    }],
    ...overrides,
  };
}

function createService() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    student: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    programme: { findUniqueOrThrow: jest.fn() },
    curriculumVersion: { findFirst: jest.fn() },
    programmeCourse: { findMany: jest.fn() },
    academicRequirementGroup: { findMany: jest.fn() },
    academicExemption: { findMany: jest.fn() },
    academicSubstitution: { findMany: jest.fn() },
    academicTransferCredit: { findMany: jest.fn() },
    courseEquivalency: { findMany: jest.fn() },
    degreeAudit: { create: jest.fn() },
    academicPlan: { updateMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    academicPolicyVersion: { findMany: jest.fn() },
    academicStanding: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    progressionEvaluation: { findUnique: jest.fn(), create: jest.fn() },
    academicPlacement: { create: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    academicAppeal: { create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    programmeTransferRequest: { findFirst: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    academicInterruption: { findFirst: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    academicCredential: { create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    runExclusive: jest.fn((_context: unknown, fn: (client: typeof tx) => unknown) => fn(tx)),
    degreeAudit: { findFirst: jest.fn() },
    academicPlan: { findFirst: jest.fn() },
    student: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    academicAppeal: { create: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AcademicService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    {} as RlsContextService,
  );
  return { service, tx, prisma, audit };
}

describe('AcademicService lifecycle safeguards', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it('loads approved exemptions, substitutions, transfers and effective equivalencies into the persisted audit evidence', async () => {
    const { service, tx, audit } = createService();
    tx.student.findUniqueOrThrow.mockResolvedValue(makeStudent());
    tx.programmeCourse.findMany.mockResolvedValue([
      { courseId: 'course-1', level: 100, semester: 'FIRST', isCompulsory: true, course: { code: 'GST101', title: 'Communication', creditUnits: 2 } },
      { courseId: 'course-2', level: 100, semester: 'SECOND', isCompulsory: true, course: { code: 'GST102', title: 'Academic Writing', creditUnits: 2 } },
    ]);
    tx.academicRequirementGroup.findMany.mockResolvedValue([{
      id: 'group-1', name: 'Core', groupType: 'CORE', minCourses: null, maxCourses: null, minCreditUnits: null, maxCreditUnits: null, allowDoubleCounting: false,
      requirements: [
        { id: 'requirement-1', courseId: 'course-1', isCompulsoryWithinGroup: true, course: { code: 'GST101', title: 'Communication', creditUnits: 2 } },
        { id: 'requirement-2', courseId: 'course-2', isCompulsoryWithinGroup: true, course: { code: 'GST102', title: 'Academic Writing', creditUnits: 2 } },
      ],
    }]);
    tx.academicExemption.findMany.mockResolvedValue([{ id: 'exemption-1', curriculumRequirementId: 'requirement-1', approvedById: 'officer-1', approvedAt: NOW }]);
    tx.academicSubstitution.findMany.mockResolvedValue([{ id: 'substitution-1', curriculumRequirementId: 'requirement-2', substituteCourseId: 'course-2', approvedById: 'officer-1', approvedAt: NOW }]);
    tx.academicTransferCredit.findMany.mockResolvedValue([{ id: 'transfer-1', creditUnits: 3, mappedCourseId: 'course-2', approvedById: 'officer-1', approvedAt: NOW }]);
    tx.courseEquivalency.findMany.mockResolvedValue([{ id: 'equivalency-1', fromCourseId: 'course-4', toCourseId: 'course-1', direction: 'BIDIRECTIONAL' }]);
    tx.degreeAudit.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'audit-1', ...data }));
    tx.academicPlan.updateMany.mockResolvedValue({ count: 0 });
    tx.academicPlan.create.mockResolvedValue({ id: 'plan-1', items: [] });

    const saved = await service.runDegreeAudit('student-1', 'officer-1');

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.academicPlan.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId: 'student-1', status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    }));
    expect(saved.policySnapshot).toEqual(expect.objectContaining({
      exceptionSourceIds: {
        exemptionIds: ['exemption-1'],
        substitutionIds: ['substitution-1'],
        transferCreditIds: ['transfer-1'],
        equivalencyIds: ['equivalency-1'],
      },
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ targetTable: 'degree_audits' }), 'officer-1');
  });

  it('preserves unmet elective requirement IDs in the canonical plan input', async () => {
    const { service, tx } = createService();
    tx.student.findUniqueOrThrow.mockResolvedValue(makeStudent({
      results: [{
        id: 'result-1',
        courseOffering: { courseId: 'course-1', course: { code: 'ELEC101', title: 'Elective One' } },
        creditUnits: 3,
        grade: 'A',
        attemptNumber: 1,
        gradePoint: 4,
      }],
    }));
    tx.programmeCourse.findMany.mockResolvedValue([
      { courseId: 'course-1', level: 100, semester: 'FIRST', isCompulsory: false, course: { code: 'ELEC101', title: 'Elective One', creditUnits: 3 } },
      { courseId: 'course-2', level: 100, semester: 'SECOND', isCompulsory: false, course: { code: 'ELEC102', title: 'Elective Two', creditUnits: 3 } },
    ]);
    tx.academicRequirementGroup.findMany.mockResolvedValue([{
      id: 'group-elective', name: 'Departmental Electives', groupType: 'DEPARTMENTAL_ELECTIVE',
      minCourses: 2, maxCourses: null, minCreditUnits: null, maxCreditUnits: null, allowDoubleCounting: false,
      requirements: [
        { id: 'req-1', courseId: 'course-1', isCompulsoryWithinGroup: false, course: { code: 'ELEC101', title: 'Elective One', creditUnits: 3 } },
        { id: 'req-2', courseId: 'course-2', isCompulsoryWithinGroup: false, course: { code: 'ELEC102', title: 'Elective Two', creditUnits: 3 } },
      ],
    }]);
    tx.academicExemption.findMany.mockResolvedValue([]);
    tx.academicSubstitution.findMany.mockResolvedValue([]);
    tx.academicTransferCredit.findMany.mockResolvedValue([]);
    tx.courseEquivalency.findMany.mockResolvedValue([]);
    tx.degreeAudit.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'audit-elective', ...data }));
    tx.academicPlan.updateMany.mockResolvedValue({ count: 0 });
    tx.academicPlan.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'plan-elective', ...data, items: [] }));

    const audit = await service.runDegreeAudit('student-1', 'officer-1');

    expect((audit.policySnapshot as { unmetRequirementGroups: Array<{ unmetRequirementIds: string[] }> }).unmetRequirementGroups[0]?.unmetRequirementIds).toEqual(['req-2']);
    expect(tx.academicPlan.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: { create: [expect.objectContaining({ courseId: 'course-2' })] },
      }),
    }));
  });

  it('chooses the programme-scoped active policies and supplies prior standing history to the standing engine', async () => {
    const { service, tx } = createService();
    tx.student.findUniqueOrThrow.mockResolvedValue(makeStudent());
    tx.academicPolicyVersion.findMany.mockResolvedValue([
      { id: 'prog-institution', policyType: 'PROGRESSION', scope: 'INSTITUTION', scopeId: null, priority: 0, effectiveFrom: NOW, approvalStatus: 'ACTIVE', ruleDefinition: { minCreditUnitsToProgress: 18, minCgpaForUnconditionalProgress: 2, maxCarryoversForConditionalProgress: 2, conditionalProgressionAction: 'PROMOTE_WITH_CARRYOVER' } },
      { id: 'prog-programme', policyType: 'PROGRESSION', scope: 'PROGRAMME', scopeId: 'programme-1', priority: 0, effectiveFrom: NOW, approvalStatus: 'ACTIVE', ruleDefinition: { minCreditUnitsToProgress: 18, minCgpaForUnconditionalProgress: 2.4, maxCarryoversForConditionalProgress: 1, conditionalProgressionAction: 'REPEAT_PLACEMENT' } },
      { id: 'standing-programme', policyType: 'ACADEMIC_STANDING', scope: 'PROGRAMME', scopeId: 'programme-1', priority: 0, effectiveFrom: NOW, approvalStatus: 'ACTIVE', ruleDefinition: { probationCgpaThreshold: 1, warningCgpaThreshold: 2.7, consecutiveProbationPeriodsForSuspension: 2 } },
    ]);
    tx.academicStanding.findMany.mockResolvedValue([{ academicHistoryId: 'history-0', standing: 'PROBATION', academicHistory: { startDate: new Date('2025-01-01') } }]);
    tx.progressionEvaluation.findUnique.mockResolvedValue(null);
    tx.academicStanding.findUnique.mockResolvedValue(null);
    tx.progressionEvaluation.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'progression-1', ...data }));
    tx.academicStanding.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'standing-1', ...data }));
    tx.academicPlacement.create.mockResolvedValue({ id: 'placement-1', status: 'RECOMMENDED' });

    const result = await service.runProgression('student-1', 'registrar-1');

    expect(result.progression.policyVersionId).toBe('prog-programme');
    expect(result.standing.policyVersionId).toBe('standing-programme');
    expect(tx.academicStanding.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ policySnapshot: expect.objectContaining({ priorStandingCount: 1 }) }),
    }));
  });

  it('resumes an approved interruption only after its end date and restores a deferred student', async () => {
    const { service, tx, audit } = createService();
    tx.academicInterruption.findUniqueOrThrow.mockResolvedValue({
      id: 'interruption-1', studentId: 'student-1', status: 'APPROVED', endDate: new Date('2026-08-01T00:00:00.000Z'),
    });
    tx.student.findUniqueOrThrow.mockResolvedValue({ status: StudentStatus.DEFERRED });
    tx.student.update.mockResolvedValue({ id: 'student-1', status: StudentStatus.ACTIVE });
    tx.academicInterruption.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'interruption-1', ...data }));

    const resumed = await service.resumeInterruption('interruption-1', 'registrar-1');

    expect(tx.student.update).toHaveBeenCalledWith({ where: { id: 'student-1' }, data: { status: StudentStatus.ACTIVE } });
    expect(resumed.status).toBe('COMPLETED');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ targetTable: 'academic_interruptions' }), 'registrar-1');
  });

  it('applies an independently authorized suspension placement to the operational student record', async () => {
    const { service, tx, audit } = createService();
    tx.academicPlacement.findUniqueOrThrow.mockResolvedValue({ id: 'placement-1', studentId: 'student-1', status: 'RECOMMENDED', decision: 'SUSPEND', toLevel: 200 });
    tx.student.findUniqueOrThrow.mockResolvedValue({ id: 'student-1' });
    tx.student.update.mockResolvedValue({ id: 'student-1', status: StudentStatus.SUSPENDED });
    tx.academicPlacement.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'placement-1', decision: 'SUSPEND', ...data }));

    const placement = await service.applyPlacement('placement-1', 'registrar-1');

    expect(tx.student.update).toHaveBeenCalledWith({ where: { id: 'student-1' }, data: { level: 200, status: StudentStatus.SUSPENDED } });
    expect(placement.status).toBe('APPLIED');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ targetTable: 'academic_placements' }), 'registrar-1');
  });
});
