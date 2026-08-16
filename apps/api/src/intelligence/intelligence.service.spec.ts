import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import { IntelligenceService } from './intelligence.service';

describe('IntelligenceService workflows', () => {
  let service: IntelligenceService;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = { automationTask: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS', assignedToId: 'actor-1' }) } };
    prisma = {
      $transaction: jest.fn((fn: (client: any) => unknown) => fn(tx)),
      enterpriseAlert: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
      automationTask: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'actor-2', isActive: true }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new IntelligenceService(prisma);
  });

  it('rejects resolution by a non-assignee', async () => {
    prisma.enterpriseAlert.findUniqueOrThrow.mockResolvedValue({ id: 'alert-1', assignedToId: 'other', status: AlertStatus.OPEN });
    await expect(service.resolveAlert('alert-1', 'actor-1', 'STAFF')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves an alert and records the transition', async () => {
    prisma.enterpriseAlert.findUniqueOrThrow.mockResolvedValue({ id: 'alert-1', assignedToId: 'actor-1', status: AlertStatus.ACKNOWLEDGED });
    prisma.enterpriseAlert.update.mockResolvedValue({ id: 'alert-1', status: AlertStatus.RESOLVED });
    await service.resolveAlert('alert-1', 'actor-1', 'STAFF');
    expect(prisma.enterpriseAlert.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: AlertStatus.RESOLVED }) }));
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('claims an unassigned task atomically', async () => {
    prisma.automationTask.findUniqueOrThrow.mockResolvedValue({ id: 'task-1', status: 'OPEN', assignedToId: null });
    await service.claimTask('task-1', 'actor-1');
    expect(tx.automationTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assignedToId: null }) }));
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('rejects a task status transition by an unrelated operator', async () => {
    prisma.automationTask.findUniqueOrThrow.mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS', assignedToId: 'other' });
    await expect(service.updateTaskStatus('task-1', 'COMPLETED', 'actor-1', 'STAFF')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects completion from OPEN without claiming first', async () => {
    prisma.automationTask.findUniqueOrThrow.mockResolvedValue({ id: 'task-1', status: 'OPEN', assignedToId: 'actor-1' });
    await expect(service.updateTaskStatus('task-1', 'COMPLETED', 'actor-1', 'STAFF')).rejects.toBeInstanceOf(ConflictException);
  });
});
