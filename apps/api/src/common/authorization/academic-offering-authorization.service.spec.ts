import { ForbiddenException } from '@nestjs/common';
import { AcademicOfferingAuthorizationService } from './academic-offering-authorization.service';

describe('AcademicOfferingAuthorizationService', () => {
  const prisma: any = {
    courseOffering: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'offering-1',
        lecturer: { userId: 'lecturer-1' },
        course: { department: { hod: { userId: 'hod-1' }, faculty: { dean: { userId: 'dean-1' } } } },
      }),
    },
    examInvigilator: { findMany: jest.fn().mockResolvedValue([{ staff: { userId: 'invigilator-1' } }]) },
  };
  const service = new AcademicOfferingAuthorizationService(prisma);

  it.each([
    ['STAFF', 'lecturer-1'],
    ['HOD', 'hod-1'],
    ['DEAN', 'dean-1'],
    ['REGISTRAR', 'unrelated-user'],
    ['SUPER_ADMIN', 'unrelated-user'],
  ])('allows %s actor %s for the offering', async (role, actorId) => {
    await expect(service.assertOfferingAccess('offering-1', actorId, role)).resolves.toBeUndefined();
  });

  it('allows an assigned invigilator for an exam operation', async () => {
    await expect(service.assertOfferingAccess('offering-1', 'invigilator-1', 'STAFF', 'exam-1')).resolves.toBeUndefined();
    expect(prisma.examInvigilator.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { examTimetableId: 'exam-1' } }));
  });

  it('rejects unrelated staff from the offering', async () => {
    await expect(service.assertOfferingAccess('offering-1', 'staff-other', 'STAFF')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
