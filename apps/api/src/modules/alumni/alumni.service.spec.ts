import { BadRequestException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
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

const makeCampaign = (overrides: Record<string, unknown> = {}) => ({
  id: 'campaign-1', status: 'ACTIVE', currency: 'NGN',
  ...overrides,
});

const makeDonation = (overrides: Record<string, unknown> = {}) => ({
  id: 'donation-1', campaignId: 'campaign-1', alumniId: 'alumni-1',
  amount: { toString: () => '100.00' }, currency: 'NGN', status: 'PENDING',
  ...overrides,
});

describe('AlumniService authorization', () => {
  let service: AlumniService;
  const prisma = {
    alumni: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    campaign: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    donation: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback({
      campaign: { update: prisma.campaign.update },
      donation: { update: prisma.donation.update },
    })),
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

  describe('donations', () => {
    beforeEach(() => {
      prisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());
      prisma.alumni.findFirst.mockResolvedValue({ id: 'alumni-1' });
      prisma.donation.create.mockResolvedValue(makeDonation());
      prisma.donation.findUniqueOrThrow.mockResolvedValue(makeDonation());
      prisma.donation.update.mockResolvedValue(makeDonation({ status: 'COMPLETED', providerRef: 'provider-1' }));
      prisma.campaign.update.mockResolvedValue(makeCampaign({ raisedAmount: 100 }));
    });

    it('rejects zero and negative donation amounts', async () => {
      await expect(service.createDonation({ campaignId: 'campaign-1', amount: '0' }, 'owner-1', 'STUDENT'))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(service.createDonation({ campaignId: 'campaign-1', amount: '-10' }, 'owner-1', 'STUDENT'))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.donation.create).not.toHaveBeenCalled();
    });

    it('binds a self-service alumniId to the current actor', async () => {
      prisma.alumni.findFirst.mockResolvedValue(null);
      await expect(service.createDonation({ campaignId: 'campaign-1', alumniId: 'alumni-1', amount: '100' }, 'other-user', 'STUDENT'))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.donation.create).not.toHaveBeenCalled();
    });

    it('records a valid donation as pending and states that Finance reconciliation is required', async () => {
      const result = await service.createDonation({ campaignId: 'campaign-1', alumniId: 'alumni-1', amount: '100.00' }, 'owner-1', 'STUDENT');
      expect(result.status).toBe('PENDING');
      expect(result.message).toContain('Finance reconciliation');
      expect(prisma.donation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ amount: expect.objectContaining({}) }),
      }));
    });

    it('requires a Finance role and provider/reconciliation proof before completion', async () => {
      await expect(service.completeDonation('donation-1', { status: 'COMPLETED', providerRef: 'provider-1' }, 'staff-1', 'STAFF'))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.completeDonation('donation-1', { status: 'COMPLETED' }, 'bursar-1', 'BURSAR'))
        .rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('allows only a pending, provider-proven Finance completion and increments once', async () => {
      await expect(service.completeDonation('donation-1', { status: 'COMPLETED', providerRef: 'provider-1' }, 'bursar-1', 'BURSAR'))
        .resolves.toMatchObject({ status: 'COMPLETED' });
      expect(prisma.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'campaign-1' },
        data: { raisedAmount: { increment: 100 } },
      }));
    });

    it('blocks refunds until an explicit donation ledger workflow exists', async () => {
      await expect(service.completeDonation('donation-1', { status: 'REFUNDED', providerRef: 'refund-1' }, 'bursar-1', 'BURSAR'))
        .rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.donation.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });
});
