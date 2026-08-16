import {
  BadRequestException, ConflictException, Injectable, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, AllocationStatus } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type { AllocateRoomDto, CreateBlockDto, CreateRoomDto } from './dto/hostel.dto';

@Injectable()
export class HostelService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async createBlock(dto: CreateBlockDto, actorId: string) {
    const block = await this.prisma.hostelBlock.create({
      data: { name: dto.name, gender: dto.gender, totalRooms: dto.totalRooms, isActive: true },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'hostel_blocks', targetId: block.id, newValues: { name: dto.name } }, actorId);
    return block;
  }

  async createRoom(dto: CreateRoomDto, actorId: string) {
    const existing = await this.prisma.room.findUnique({
      where: { uq_room_in_block: { hostelBlockId: dto.hostelBlockId, roomNumber: dto.roomNumber } },
    });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'Room number already exists in this block' });

    const room = await this.prisma.room.create({
      data: { hostelBlockId: dto.hostelBlockId, roomNumber: dto.roomNumber, capacity: dto.capacity, roomType: dto.roomType, currentOccupancy: 0, isActive: true },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'rooms', targetId: room.id, newValues: { roomNumber: dto.roomNumber } }, actorId);
    return room;
  }

  async getAllBlocks() {
    return this.prisma.hostelBlock.findMany({
      where: { isActive: true },
      include: { _count: { select: { rooms: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getRoomsInBlock(hostelBlockId: string) {
    return this.prisma.room.findMany({
      where: { hostelBlockId, isActive: true },
      include: {
        allocations: {
          where: { status: AllocationStatus.ACTIVE },
          include: { student: { select: { matricNo: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { roomNumber: 'asc' },
    });
  }

  async allocateRoom(dto: AllocateRoomDto, actorId: string) {
    const allocation = await this.prisma.$transaction(async (tx) => {
      // Lock and re-read the room inside the transaction. The previous
      // pre-transaction capacity check allowed two concurrent requests to
      // both observe a free bed and oversubscribe the room.
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${dto.roomId} FOR UPDATE`;
      const room = await tx.room.findUniqueOrThrow({
        where: { id: dto.roomId },
        include: { hostelBlock: { select: { id: true, name: true, gender: true } } },
      });
      if (!room.isActive || room.currentOccupancy >= room.capacity) {
        throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Room is at full capacity or inactive' });
      }

      // Student gender must match a single-sex block. Both values are
      // institution-managed strings, so comparison is normalized here.
      const student = await tx.student.findUniqueOrThrow({ where: { id: dto.studentId }, select: { gender: true } });
      const blockGender = room.hostelBlock.gender.trim().toUpperCase();
      const studentGender = student.gender.trim().toUpperCase();
      if (blockGender !== 'MIXED' && blockGender !== studentGender) {
        throw new UnprocessableEntityException({
          code: 'BUSINESS_RULE_INVALID_STATE',
          message: `${room.hostelBlock.name} is a ${blockGender} block and cannot accept a ${studentGender} student`,
        });
      }

      const existing = await tx.roomAllocation.findUnique({
        where: { uq_student_room_year: { studentId: dto.studentId, academicYear: dto.academicYear } },
      });
      if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'Student already has a room allocation for this academic year' });

      const a = await tx.roomAllocation.create({
        data: {
          roomId: dto.roomId, studentId: dto.studentId, academicYear: dto.academicYear,
          startDate: new Date(dto.startDate), status: AllocationStatus.ACTIVE, allocatedById: actorId,
        },
      });
      await tx.room.update({ where: { id: dto.roomId }, data: { currentOccupancy: { increment: 1 } } });
      return a;
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'room_allocations', targetId: allocation.id,
      newValues: { roomId: dto.roomId, studentId: dto.studentId, academicYear: dto.academicYear },
    }, actorId);
    return allocation;
  }

  async vacateRoom(allocationId: string, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      const allocation = await tx.roomAllocation.findUniqueOrThrow({ where: { id: allocationId } });
      if (allocation.status !== AllocationStatus.ACTIVE) throw new BadRequestException('Allocation is not ACTIVE');
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${allocation.roomId} FOR UPDATE`;
      const updated = await tx.room.updateMany({
        where: { id: allocation.roomId, currentOccupancy: { gt: 0 } },
        data: { currentOccupancy: { decrement: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException({ code: 'HOSTEL_OCCUPANCY_INCONSISTENT', message: 'Room occupancy is inconsistent; vacancy was not completed.' });
      await tx.roomAllocation.update({
        where: { id: allocationId }, data: { status: AllocationStatus.VACATED, endDate: new Date() },
      });
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'room_allocations', targetId: allocationId, newValues: { status: 'VACATED' } }, actorId);
    return { message: 'Room vacated successfully' };
  }

  async getStudentAllocation(studentId: string, academicYear: string) {
    return this.prisma.roomAllocation.findFirst({
      where: { studentId, academicYear, status: AllocationStatus.ACTIVE },
      include: { room: { include: { hostelBlock: true } } },
    });
  }
}
