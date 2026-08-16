import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { GrantStatus, ResearchStatus } from '@prisma/client';
import { ResearchService } from './research.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

describe('ResearchService operational boundaries', () => {
  let service: ResearchService;
  const prisma: any = {
    researchProject: { create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    researchMember: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    grant: { create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
    grantExpenditure: { findMany: jest.fn(), create: jest.fn() },
    researchOutput: { create: jest.fn(), count: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((operation: unknown) => Array.isArray(operation) ? Promise.all(operation) : (operation as (tx: unknown) => unknown)(prisma)),
  };
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ResearchService(prisma as PrismaService, audit as unknown as AuditService);
  });

  it('prevents non-leads from editing project details', async () => {
    prisma.researchProject.findUniqueOrThrow.mockResolvedValue({ id: 'project-1', leadResearcherId: 'lead-1', status: ResearchStatus.PENDING, title: 'Study', abstract: 'A', budget: '1000', keywords: [] });
    await expect(service.updateProject('project-1', { title: 'Changed' }, 'other-user')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.researchProject.update).not.toHaveBeenCalled();
  });

  it('requires ethics approval before activating a project', async () => {
    prisma.researchProject.findUniqueOrThrow.mockResolvedValue({ id: 'project-1', status: ResearchStatus.PENDING, ethicsApprovalRef: null });
    await expect(service.updateProjectStatus('project-1', { status: ResearchStatus.ACTIVE }, 'lead-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.researchProject.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate research members', async () => {
    prisma.researchProject.findUniqueOrThrow.mockResolvedValue({ id: 'project-1', leadResearcherId: 'lead-1' });
    prisma.researchMember.findUnique.mockResolvedValue({ id: 'member-existing' });
    await expect(service.addMember('project-1', { userId: 'member-1', role: 'RESEARCHER' }, 'lead-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.researchMember.create).not.toHaveBeenCalled();
  });

  it('protects grant budget during expenditure recording', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'grant-1', status: GrantStatus.ACTIVE, amount: '1000', projectId: 'project-1' }]);
    prisma.grantExpenditure.findMany.mockResolvedValue([{ amount: '900' }]);
    await expect(service.recordExpenditure('grant-1', { description: 'Equipment', amount: '200', expendedAt: '2099-01-01' }, 'lead-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.grantExpenditure.create).not.toHaveBeenCalled();
  });
});
