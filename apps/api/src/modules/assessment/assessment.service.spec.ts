import { ConflictException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AcademicOfferingAuthorizationService } from '../../common/authorization/academic-offering-authorization.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { AssessmentService } from './assessment.service';

describe('AssessmentService academic-integrity controls', () => {
  let service: AssessmentService;
  const authorization = { assertOfferingAccess: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;
  const prisma: any = {
    courseOffering: { findUnique: jest.fn().mockResolvedValue({ id: 'offering-1', semesterId: 'semester-1' }), findUniqueOrThrow: jest.fn() },
    assessmentScheme: { findUnique: jest.fn().mockResolvedValue({ courseOfferingId: 'offering-1' }), findFirst: jest.fn() },
    assessmentComponent: { findUniqueOrThrow: jest.fn() },
    courseRegistration: { findFirst: jest.fn().mockResolvedValue({ id: 'registration-1' }), findMany: jest.fn() },
    assessmentMark: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    institutionSettings: { findFirst: jest.fn() },
    examAttendance: { findMany: jest.fn() },
    studentResult: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AssessmentService(prisma as PrismaService, audit, authorization as unknown as AcademicOfferingAuthorizationService);
  });

  it('requires shared offering authorization before saving a mark', async () => {
    prisma.assessmentComponent.findUniqueOrThrow.mockResolvedValue({
      maxScore: 100,
      scheme: { courseOfferingId: 'offering-1', status: 'ACTIVE' },
    });
    prisma.assessmentMark.findUnique.mockResolvedValue(null);
    prisma.assessmentMark.upsert.mockResolvedValue({ id: 'mark-1' });

    await service.saveMark({ studentId: 'student-1', componentId: 'component-1', courseOfferingId: 'offering-1', score: 75 }, 'staff-1', 'STAFF');

    expect(authorization.assertOfferingAccess).toHaveBeenCalledWith('offering-1', 'staff-1', 'STAFF');
    expect(prisma.assessmentMark.upsert).toHaveBeenCalled();
  });

  it('rejects edits to finalized marks', async () => {
    prisma.assessmentComponent.findUniqueOrThrow.mockResolvedValue({
      maxScore: 100,
      scheme: { courseOfferingId: 'offering-1', status: 'ACTIVE' },
    });
    prisma.assessmentMark.findUnique.mockResolvedValue({ status: 'FINALIZED' });

    await expect(service.saveMark({ studentId: 'student-1', componentId: 'component-1', courseOfferingId: 'offering-1', score: 75 }, 'staff-1', 'STAFF'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.assessmentMark.upsert).not.toHaveBeenCalled();
  });

  it('does not generate draft results from incomplete or unfinalized marks', async () => {
    jest.spyOn(service, 'getGradebook').mockResolvedValue({
      scheme: { id: 'scheme-1', version: 1, components: [] }, rows: [],
      summary: { total: 1, complete: 1, incomplete: 0, finalized: 0, unfinalized: 1 },
    } as any);

    await expect(service.generateDraftResults('offering-1', 'hod-1', 'HOD')).rejects.toBeInstanceOf(ConflictException);
  });

  it('finalizes all draft marks only after a complete gradebook check', async () => {
    jest.spyOn(service, 'getGradebook').mockResolvedValue({
      scheme: { id: 'scheme-1', version: 1, components: [] }, rows: [],
      summary: { total: 1, complete: 1, incomplete: 0, finalized: 0, unfinalized: 1 },
    } as any);
    prisma.assessmentMark.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.finalizeMarks('offering-1', 'hod-1', 'HOD');

    expect(result.finalized).toBe(3);
    expect(prisma.assessmentMark.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseOfferingId: 'offering-1', status: 'DRAFT' },
      data: expect.objectContaining({ status: 'FINALIZED', finalizedById: 'hod-1' }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: AuditAction.UPDATE }), 'hod-1');
  });
});
