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
    prisma = { $transaction: jest.fn((fn: (client: any) => unknown) => fn(tx)), room: { findUniqueOrThrow: jest.fn() }, student: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() }, roomAllocation: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) } };
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

  it('lists active allocations for the selected academic year', async () => {
    prisma.roomAllocation.findMany.mockResolvedValue([{ id: 'allocation-1', academicYear: '2025/2026' }]);
    await expect(service.getActiveAllocations('2025/2026')).resolves.toEqual([{ id: 'allocation-1', academicYear: '2025/2026' }]);
    expect(prisma.roomAllocation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: AllocationStatus.ACTIVE, academicYear: '2025/2026' } }));
  });

  it('does not allow vacancy to drive occupancy below zero', async () => {
    tx.room.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.vacateRoom('allocation-1', 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.roomAllocation.update).not.toHaveBeenCalled();
  });

  it('resolves User.id to Student.id for self-allocation lookup', async () => {
    const allocation = { id: 'allocation-1', studentId: 'student-1', academicYear: '2025/2026' };
    prisma.student.findUnique.mockResolvedValue({ id: 'student-1' });
    prisma.roomAllocation.findFirst.mockResolvedValue(allocation);

    await expect(service.getMyAllocation('user-1', '2025/2026')).resolves.toEqual(allocation);
    expect(prisma.student.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' }, select: { id: true } });
    expect(prisma.roomAllocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId: 'student-1', academicYear: '2025/2026', status: AllocationStatus.ACTIVE },
    }));
  });
});
