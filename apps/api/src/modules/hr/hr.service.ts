import {
  BadRequestException, ConflictException,
  ForbiddenException, Injectable,
} from '@nestjs/common';
import { AuditAction, EmploymentStatus, LeaveStatus } from '@prisma/client';
import { encryptPii } from '@uniportal/utils';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type { CreateSalaryGradeDto, CreateStaffDto, LeaveDecisionDto, RequestLeaveDto } from './dto/hr.dto';

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit:  AuditService,
  ) {}

  // ── Salary Grades ──────────────────────────────────────────────────────────
  async createSalaryGrade(dto: CreateSalaryGradeDto, actorId: string) {
    const grade = await this.prisma.salaryGrade.create({
      data: {
        gradeLevel:            dto.gradeLevel.toUpperCase(),
        basicSalary:           dto.basicSalary,
        housingAllowancePct:   dto.housingAllowancePct   ?? 15,
        transportAllowancePct: dto.transportAllowancePct ?? 10,
        medicalAllowancePct:   dto.medicalAllowancePct   ?? 5,
        isActive:              true,
      },
    });
    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'salary_grades', targetId: grade.id,
      newValues: { gradeLevel: grade.gradeLevel, basicSalary: dto.basicSalary },
    }, actorId);
    return grade;
  }

  async findAllSalaryGrades() {
    return this.prisma.salaryGrade.findMany({ where: { isActive: true }, orderBy: { gradeLevel: 'asc' } });
  }

  // ── Staff ──────────────────────────────────────────────────────────────────
  async createStaff(dto: CreateStaffDto, actorId: string) {
    const existing = await this.prisma.staff.findUnique({ where: { employeeNo: dto.employeeNo } });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'Employee number already exists' });

    const staff = await this.prisma.staff.create({
      data: {
        userId:          dto.userId,
        employeeNo:      dto.employeeNo,
        ippisNo:         dto.ippisNo ?? null,
        rsaPin:          dto.rsaPin ? encryptPii(dto.rsaPin) : null,  // PII encrypted
        pfaCode:         dto.pfaCode ?? null,
        firstName:       dto.firstName,
        lastName:        dto.lastName,
        middleName:      dto.middleName ?? null,
        dateOfBirth:     new Date(dto.dateOfBirth),
        gender:          dto.gender,
        phone:           dto.phone,
        email:           dto.email.toLowerCase(),
        designation:     dto.designation,
        departmentId:    dto.departmentId,
        salaryGradeId:   dto.salaryGradeId,
        employmentType:  dto.employmentType,
        employmentStatus: EmploymentStatus.ACTIVE,
        appointmentDate: new Date(dto.appointmentDate),
        bankName:        dto.bankName ?? null,
        accountNumber:   dto.accountNumber ? encryptPii(dto.accountNumber) : null, // PII
        accountName:     dto.accountName ?? null,
        bankCode:        dto.bankCode ?? null,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'staff', targetId: staff.id,
      newValues: { employeeNo: dto.employeeNo, designation: dto.designation },
    }, actorId);

    return staff;
  }

  async findAll(filters: {
    departmentId?: string; employmentStatus?: EmploymentStatus;
    page: number; pageSize: number;
  }) {
    const { departmentId, employmentStatus, page, pageSize } = filters;
    const where = {
      ...(departmentId       ? { departmentId }       : {}),
      ...(employmentStatus   ? { employmentStatus }   : {}),
    };
    const [staff, total] = await this.prisma.$transaction([
      this.prisma.staff.findMany({
        where,
        include: {
          department:  { select: { name: true, code: true } },
          salaryGrade: { select: { gradeLevel: true, basicSalary: true } },
        },
        orderBy: { lastName: 'asc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      this.prisma.staff.count({ where }),
    ]);
    return { staff, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: string) {
    return this.prisma.staff.findUniqueOrThrow({
      where:   { id },
      include: {
        department:  true,
        salaryGrade: true,
        allowances:  { where: { isRecurring: true } },
      },
    });
  }

  async retire(id: string, actorId: string) {
    const staff = await this.prisma.staff.findUniqueOrThrow({ where: { id } });
    if (staff.employmentStatus !== EmploymentStatus.ACTIVE)
      throw new BadRequestException(`Staff is already ${staff.employmentStatus}`);

    const updated = await this.prisma.staff.update({
      where: { id }, data: { employmentStatus: EmploymentStatus.RETIRED, retirementDate: new Date() },
    });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'staff', targetId: id,
      newValues: { employmentStatus: 'RETIRED' },
    }, actorId);
    return updated;
  }

  // ── Leave Management ───────────────────────────────────────────────────────
  async requestLeave(dto: RequestLeaveDto, staffId: string) {
    const start    = new Date(dto.startDate);
    const end      = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException('Leave end must be after start');

    const days = Math.ceil((end.getTime() - start.getTime()) / 86400_000);

    // Check for overlapping leave
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        staffId,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        OR: [
          { startDate: { lte: end },   endDate: { gte: start } },
        ],
      },
    });
    if (overlap) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'Overlapping leave request exists' });

    return this.prisma.leaveRequest.create({
      data: {
        staffId, leaveType: dto.leaveType, startDate: start, endDate: end,
        daysRequested: days, reason: dto.reason, status: LeaveStatus.PENDING,
      },
    });
  }

  async decideLeave(leaveId: string, dto: LeaveDecisionDto, actorId: string, actorRole: string) {
    if (!['HOD','HR_MANAGER','REGISTRAR','SUPER_ADMIN'].includes(actorRole))
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only HR Manager or HOD can decide on leave requests' });

    const leave = await this.prisma.leaveRequest.findUniqueOrThrow({ where: { id: leaveId } });
    if (leave.status !== LeaveStatus.PENDING)
      throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: `Leave already ${leave.status}` });

    const newStatus = dto.action === 'APPROVE' ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;
    const updated   = await this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data:  { status: newStatus, approvedById: actorId, approvedAt: new Date(),
               rejectionNote: dto.action === 'REJECT' ? (dto.note ?? null) : null },
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'leave_requests', targetId: leaveId,
      newValues: { status: newStatus },
    }, actorId);

    // Update employment status if APPROVED
    if (newStatus === LeaveStatus.APPROVED) {
      await this.prisma.staff.update({
        where: { id: leave.staffId }, data: { employmentStatus: EmploymentStatus.ON_LEAVE },
      });
    }

    return updated;
  }


  async findPendingLeaves(departmentId?: string) {
    return this.prisma.leaveRequest.findMany({
      where: {
        status: LeaveStatus.PENDING,
        ...(departmentId ? { staff: { departmentId } } : {}),
      },
      include: { staff: { select: { firstName: true, lastName: true, employeeNo: true, designation: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
