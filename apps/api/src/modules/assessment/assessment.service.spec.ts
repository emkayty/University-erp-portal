import { ConflictException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AcademicOfferingAuthorizationService } from '../../common/authorization/academic-offering-authorization.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { AssessmentService } from './assessment.service';
import { GradeUploadMode } from './dto';

describe('AssessmentService academic-integrity controls', () => {
  let service: AssessmentService;
  const authorization = { assertOfferingAccess: jest.fn().mockResolvedValue(undefined) };
  const authorizationPolicy = { assertIndependentApproval: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;
  const prisma: any = {
    courseOffering: { findUnique: jest.fn().mockResolvedValue({ id: 'offering-1', semesterId: 'semester-1' }), findUniqueOrThrow: jest.fn() },
    assessmentScheme: { findUnique: jest.fn().mockResolvedValue({ courseOfferingId: 'offering-1' }), findFirst: jest.fn() },
    assessmentComponent: { findUniqueOrThrow: jest.fn() },
    courseRegistration: { findFirst: jest.fn().mockResolvedValue({ id: 'registration-1' }), findMany: jest.fn() },
    assessmentMark: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    gradeUploadBatch: { create: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    institutionSettings: { findFirst: jest.fn() },
    examAttendance: { findMany: jest.fn() },
    studentResult: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AssessmentService(
      prisma as PrismaService,
      audit,
      authorization as unknown as AcademicOfferingAuthorizationService,
      authorizationPolicy as any,
    );
  });

  it('scopes the offering selector to the lecturer, department, or faculty authority', async () => {
    prisma.courseOffering.findMany = jest.fn().mockResolvedValue([]);

    await service.findAccessibleOfferings('staff-1', 'STAFF');
    expect(prisma.courseOffering.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: true, lecturer: { userId: 'staff-1' } } }));

    await service.findAccessibleOfferings('hod-1', 'HOD');
    expect(prisma.courseOffering.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: true, course: { department: { hod: { userId: 'hod-1' } } } } }));

    await service.findAccessibleOfferings('dean-1', 'DEAN');
    expect(prisma.courseOffering.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: true, course: { department: { faculty: { dean: { userId: 'dean-1' } } } } } }));
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

  it('validates a large-cohort CSV against the registered roster before applying marks', async () => {
    prisma.courseOffering.findUnique.mockResolvedValue({ id: 'offering-1', semesterId: 'semester-1' });
    prisma.assessmentScheme.findFirst.mockResolvedValue({ components: [
      { id: 'ca-1', code: 'CA', maxScore: 30, weight: 30, isRequired: true, sequence: 1 },
      { id: 'exam-1', code: 'EXAM', maxScore: 70, weight: 70, isRequired: true, sequence: 2 },
    ] });
    prisma.courseRegistration.findMany.mockResolvedValue([
      { studentId: 'student-1', student: { id: 'student-1', matricNo: 'MAT/001' } },
      { studentId: 'student-2', student: { id: 'student-2', matricNo: 'MAT/002' } },
    ]);
    prisma.gradeUploadBatch.create.mockResolvedValue({ id: 'batch-1', status: 'VALIDATED' });

    const response = await service.uploadCsv({
      courseOfferingId: 'offering-1', semesterId: 'semester-1', mode: GradeUploadMode.VALIDATE_ONLY,
      csv: 'Student ID,Matric No,CA,EXAM\nstudent-1,MAT/001,25,60\nstudent-2,MAT/002,20,55',
    }, 'staff-1', 'STAFF');

    expect(response).toMatchObject({ batchId: 'batch-1', status: 'VALIDATED', totalRows: 2, validRows: 2, errorRows: 0, appliedMarks: 0 });
    expect(prisma.assessmentMark.upsert).not.toHaveBeenCalled();
    expect(prisma.gradeUploadBatch.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ templateVersion: 'v2', mode: GradeUploadMode.VALIDATE_ONLY, checksum: expect.any(String) }) }));
  });

  it('validates a 300-student cohort without per-row database lookups', async () => {
    prisma.courseOffering.findUnique.mockResolvedValue({ id: 'offering-1', semesterId: 'semester-1' });
    prisma.assessmentScheme.findFirst.mockResolvedValue({ components: [
      { id: 'ca-1', code: 'CA', maxScore: 30, weight: 30, isRequired: true, sequence: 1 },
      { id: 'exam-1', code: 'EXAM', maxScore: 70, weight: 70, isRequired: true, sequence: 2 },
    ] });
    const registrations = Array.from({ length: 300 }, (_, index) => {
      const studentId = `student-${index + 1}`;
      const matricNo = `MAT/${String(index + 1).padStart(3, '0')}`;
      return { studentId, student: { id: studentId, matricNo } };
    });
    prisma.courseRegistration.findMany.mockResolvedValue(registrations);
    prisma.gradeUploadBatch.create.mockResolvedValue({ id: 'batch-300', status: 'VALIDATED' });
    const rows = registrations.map((registration) => `${registration.student.id},${registration.student.matricNo},25,60`).join('\n');

    const response = await service.uploadCsv({
      courseOfferingId: 'offering-1', semesterId: 'semester-1', mode: GradeUploadMode.VALIDATE_ONLY,
      csv: `Student ID,Matric No,CA,EXAM\n${rows}`,
    }, 'staff-1', 'STAFF');

    expect(response).toMatchObject({ totalRows: 300, validRows: 300, errorRows: 0, appliedMarks: 0 });
    expect(prisma.courseRegistration.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.assessmentMark.findMany).not.toHaveBeenCalled();
    expect(prisma.assessmentMark.upsert).not.toHaveBeenCalled();
  });

  it('rejects duplicate or mismatched roster rows before any apply operation', async () => {
    prisma.courseOffering.findUnique.mockResolvedValue({ id: 'offering-1', semesterId: 'semester-1' });
    prisma.assessmentScheme.findFirst.mockResolvedValue({ components: [{ id: 'ca-1', code: 'CA', maxScore: 30, weight: 100, isRequired: true, sequence: 1 }] });
    prisma.courseRegistration.findMany.mockResolvedValue([{ studentId: 'student-1', student: { id: 'student-1', matricNo: 'MAT/001' } }]);
    prisma.gradeUploadBatch.create.mockResolvedValue({ id: 'batch-2', status: 'REJECTED' });

    const response = await service.uploadCsv({
      courseOfferingId: 'offering-1', semesterId: 'semester-1', mode: GradeUploadMode.APPLY,
      csv: 'Student ID,Matric No,CA\nstudent-1,MAT/999,25\nstudent-1,MAT/001,24',
    }, 'staff-1', 'STAFF');

    expect(response).toMatchObject({ status: 'REJECTED', errorRows: 2, appliedMarks: 0 });
    expect(response.errors.map((error) => error.error).join(' ')).toContain('do not match');
    expect(prisma.assessmentMark.upsert).not.toHaveBeenCalled();
  });

  it('applies a valid cohort upload in one audited transaction and never overwrites finalized marks', async () => {
    prisma.courseOffering.findUnique.mockResolvedValue({ id: 'offering-1', semesterId: 'semester-1' });
    prisma.assessmentScheme.findFirst.mockResolvedValue({ components: [
      { id: 'ca-1', code: 'CA', maxScore: 30, weight: 30, isRequired: true, sequence: 1 },
      { id: 'exam-1', code: 'EXAM', maxScore: 70, weight: 70, isRequired: true, sequence: 2 },
    ] });
    prisma.courseRegistration.findMany.mockResolvedValue([{ studentId: 'student-1', student: { id: 'student-1', matricNo: 'MAT/001' } }]);
    prisma.assessmentMark.findMany.mockResolvedValue([]);
    prisma.gradeUploadBatch.create.mockResolvedValue({ id: 'batch-3', status: 'VALIDATED' });
    prisma.gradeUploadBatch.update.mockResolvedValue({ id: 'batch-3', status: 'APPLIED' });
    prisma.assessmentMark.upsert.mockResolvedValue({ id: 'mark-1' });

    const response = await service.uploadCsv({
      courseOfferingId: 'offering-1', semesterId: 'semester-1', mode: GradeUploadMode.APPLY,
      csv: 'Student ID,Matric No,CA,EXAM\nstudent-1,MAT/001,25,60',
    }, 'staff-1', 'STAFF');

    expect(response).toMatchObject({ batchId: 'batch-3', status: 'APPLIED', appliedMarks: 2, validRows: 1 });
    expect(prisma.assessmentMark.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ targetTable: 'grade_upload_batches', targetId: 'batch-3' }) }));
  });

  it('rejects apply mode when an existing component mark is finalized', async () => {
    prisma.courseOffering.findUnique.mockResolvedValue({ id: 'offering-1', semesterId: 'semester-1' });
    prisma.assessmentScheme.findFirst.mockResolvedValue({ components: [{ id: 'ca-1', code: 'CA', maxScore: 30, weight: 100, isRequired: true, sequence: 1 }] });
    prisma.courseRegistration.findMany.mockResolvedValue([{ studentId: 'student-1', student: { id: 'student-1', matricNo: 'MAT/001' } }]);
    prisma.gradeUploadBatch.create.mockResolvedValue({ id: 'batch-4', status: 'VALIDATED' });
    prisma.assessmentMark.findMany.mockResolvedValue([{ studentId: 'student-1', componentId: 'ca-1', status: 'FINALIZED' }]);
    prisma.gradeUploadBatch.update.mockResolvedValue({ id: 'batch-4', status: 'REJECTED' });

    const response = await service.uploadCsv({
      courseOfferingId: 'offering-1', semesterId: 'semester-1', mode: GradeUploadMode.APPLY,
      csv: 'Student ID,Matric No,CA\nstudent-1,MAT/001,25',
    }, 'staff-1', 'STAFF');

    expect(response).toMatchObject({ status: 'REJECTED', appliedMarks: 0 });
    expect(prisma.assessmentMark.upsert).not.toHaveBeenCalled();
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
