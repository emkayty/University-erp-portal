import { ForbiddenException } from '@nestjs/common';
import { SearchService } from './search.service';

function makeService() {
  const prisma: any = {
    staff: { findUnique: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  return { prisma, service: new SearchService(prisma) };
}

describe('SearchService', () => {
  it('derives an HOD department from the linked staff record', async () => {
    const h = makeService();
    h.prisma.staff.findUnique.mockResolvedValue({ departmentId: 'dept-1' });

    await expect(h.service.resolveDepartmentScope({ sub: 'hod-user', role: 'HOD', staffScope: null } as any))
      .resolves.toBe('dept-1');
    expect(h.prisma.staff.findUnique).toHaveBeenCalledWith({
      where: { userId: 'hod-user' },
      select: { departmentId: true },
    });
  });

  it('rejects a department filter outside the caller scope', async () => {
    const h = makeService();

    await expect(h.service.resolveDepartmentScope({
      sub: 'hod-user', role: 'HOD', staffScope: { scopes: ['records'], deptId: 'dept-1' },
    } as any, 'dept-2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows unrestricted institutional search to retain an explicit filter', async () => {
    const h = makeService();

    await expect(h.service.resolveDepartmentScope({ sub: 'registrar', role: 'REGISTRAR', staffScope: null } as any, 'dept-2'))
      .resolves.toBe('dept-2');
  });

  it('maps student search rows through explicit stable aliases', async () => {
    const h = makeService();
    h.prisma.$queryRaw.mockResolvedValue([{
      id: 'student-1', matric_no: 'MAT/001', first_name: 'Ada', last_name: 'Lovelace',
      email: 'ada@example.test', level: 200, status: 'ACTIVE', cgpa: '4.50',
      programme_name: 'Computer Science', department_name: 'Computing',
    }]);

    await expect(h.service.searchStudents('Ada')).resolves.toEqual([expect.objectContaining({
      id: 'student-1', matricNo: 'MAT/001', firstName: 'Ada', lastName: 'Lovelace', programme: 'Computer Science',
    })]);
  });

  it('maps staff search rows through the current schema aliases', async () => {
    const h = makeService();
    h.prisma.$queryRaw.mockResolvedValue([{
      id: 'staff-1', staff_id: 'EMP/001', first_name: 'Grace', last_name: 'Hopper',
      email: 'grace@example.test', job_title: 'Lecturer', employment_status: 'ACTIVE', department_name: 'Computing',
    }]);

    await expect(h.service.searchStaff('Grace')).resolves.toEqual([expect.objectContaining({
      id: 'staff-1', staffId: 'EMP/001', firstName: 'Grace', lastName: 'Hopper', jobTitle: 'Lecturer',
    })]);
  });
});
