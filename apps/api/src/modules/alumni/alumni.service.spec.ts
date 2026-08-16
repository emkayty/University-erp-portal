import { ForbiddenException } from '@nestjs/common';
import { AlumniService } from './alumni.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

const makeAlumni = (overrides: Record<string, unknown> = {}) => ({
  id: 'alumni-1', userId: 'owner-1', studentId: 'student-1',
  graduationYear: 2025, programme: 'BSc Computer Science', classAwarded: 'First Class',
  cgpaAtGrad: { toString: () => '4.50' }, occupation: 'Engineer', employer: 'Example Ltd',
  industry: 'Technology', linkedinUrl: 'https://linkedin.example/owner',
  currentCountry: 'Nigeria', currentCity: 'Lagos', bio: 'Profile biography',
  isProfilePublic: true, createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
});

describe('AlumniService authorization', () => {
  let service: AlumniService;
  const prisma = {
    alumni: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AlumniService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('rejects a non-owner from editing another alumni profile', async () => {
    prisma.alumni.findUniqueOrThrow.mockResolvedValue(makeAlumni());
    await expect(service.updateProfile('alumni-1', { bio: 'changed' }, 'other-user', 'STUDENT'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.alumni.update).not.toHaveBeenCalled();
  });

  it('allows the owner to edit their own profile', async () => {
    const alumni = makeAlumni();
    prisma.alumni.findUniqueOrThrow.mockResolvedValue(alumni);
    prisma.alumni.update.mockResolvedValue({ ...alumni, bio: 'changed' });
    const result = await service.updateProfile('alumni-1', { bio: 'changed' }, 'owner-1', 'STUDENT');
    expect(result.bio).toBe('changed');
    expect(prisma.alumni.update).toHaveBeenCalled();
  });

  it('rejects a non-owner from a private profile', async () => {
    prisma.alumni.findUniqueOrThrow.mockResolvedValue(makeAlumni({ isProfilePublic: false }));
    await expect(service.getAlumniById('alumni-1', 'other-user', 'STUDENT'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('minimizes public profile responses and omits identifiers and CGPA', async () => {
    prisma.alumni.findUniqueOrThrow.mockResolvedValue(makeAlumni({ isProfilePublic: true }));
    const result = await service.getAlumniById('alumni-1', 'other-user', 'STUDENT');
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('studentId');
    expect(result).not.toHaveProperty('cgpaAtGrad');
    expect(result).toHaveProperty('programme');
  });

  it('allows VC administration to view private profiles and edit them', async () => {
    const alumni = makeAlumni({ isProfilePublic: false });
    prisma.alumni.findUniqueOrThrow.mockResolvedValue(alumni);
    prisma.alumni.update.mockResolvedValue(alumni);
    await expect(service.getAlumniById('alumni-1', 'vc-user', 'VC')).resolves.toHaveProperty('studentId');
    await expect(service.updateProfile('alumni-1', { bio: 'admin update' }, 'vc-user', 'VC')).resolves.toBeDefined();
  });
});
