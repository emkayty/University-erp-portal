import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AllocationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { HostelService } from './hostel.service';

function makeRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: 'room-1', isActive: true, capacity: 2, currentOccupancy: 1,
    hostelBlock: { id: 'block-1', name: 'North Hall', gender: 'MALE' }, ...overrides,
  };
}

describe('HostelService', () => {
  let service: HostelService;
  let prisma: any;
  let tx: any;
  let audit: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'room-1' }]),
      room: { findUniqueOrThrow: jest.fn().mockResolvedValue(makeRoom()), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      student: { findUniqueOrThrow: jest.fn().mockResolvedValue({ gender: 'MALE' }) },
      roomAllocation: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'allocation-1', roomId: 'room-1', studentId: 'student-1', status: AllocationStatus.ACTIVE }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'allocation-1', roomId: 'room-1', status: AllocationStatus.ACTIVE }), update: jest.fn().mockResolvedValue({}) },
    };
    prisma = { $transaction: jest.fn((fn: (client: any) => unknown) => fn(tx)), room: { findUniqueOrThrow: jest.fn() }, student: { findUniqueOrThrow: jest.fn() }, roomAllocation: { findUnique: jest.fn() } };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({ providers: [HostelService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }] }).compile();
    service = module.get(HostelService);
  });

  it('locks and re-reads the room before allocating', async () => {
    await service.allocateRoom({ roomId: 'room-1', studentId: 'student-1', academicYear: '2025/2026', startDate: '2025-09-01' });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.roomAllocation.create).toHaveBeenCalled();
  });

  it('rejects a full room inside the transaction', async () => {
    tx.room.findUniqueOrThrow.mockResolvedValue(makeRoom({ currentOccupancy: 2 }));
    await expect(service.allocateRoom({ roomId: 'room-1', studentId: 'student-1', academicYear: '2025/2026', startDate: '2025-09-01' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.roomAllocation.create).not.toHaveBeenCalled();
  });

  it('rejects cross-gender allocation', async () => {
    tx.student.findUniqueOrThrow.mockResolvedValue({ gender: 'FEMALE' });
    await expect(service.allocateRoom({ roomId: 'room-1', studentId: 'student-1', academicYear: '2025/2026', startDate: '2025-09-01' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('does not allow vacancy to drive occupancy below zero', async () => {
    tx.room.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.vacateRoom('allocation-1', 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.roomAllocation.update).not.toHaveBeenCalled();
  });
});
