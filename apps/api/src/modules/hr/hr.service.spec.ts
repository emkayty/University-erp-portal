import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmploymentStatus, LeaveStatus } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { HrService } from './hr.service';

const makeStaff = (o: Partial<Record<string,unknown>> = {}) => ({
  id: 'staff-1', userId: 'user-1', employeeNo: 'EMP001', ippisNo: null,
  firstName: 'Funmi', lastName: 'Adeyemi', dateOfBirth: new Date('1985-03-12'),
  gender: 'Female', phone: '08012345678', email: 'funmi@uni.edu.ng',
  designation: 'Lecturer I', departmentId: 'dept-1', salaryGradeId: 'grade-1',
  employmentType: 'FULL_TIME', employmentStatus: EmploymentStatus.ACTIVE,
  appointmentDate: new Date('2015-01-01'), rsaPin: null, accountNumber: null,
  bankName: null, accountName: null, bankCode: null,
  deletedAt: null, createdAt: new Date(), updatedAt: new Date(), ...o,
});

const makeLeave = (o: Partial<Record<string,unknown>> = {}) => ({
  id: 'leave-1', staffId: 'staff-1', leaveType: 'ANNUAL',
  startDate: new Date('2025-08-01'), endDate: new Date('2025-08-14'),
  daysRequested: 14, reason: 'Annual family vacation and rest',
  status: LeaveStatus.PENDING, approvedById: null, approvedAt: null, rejectionNote: null,
  createdAt: new Date(), updatedAt: new Date(), ...o,
});

describe('HrService', () => {
  let svc: HrService;
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    prisma = {
      salaryGrade: { create: jest.fn().mockResolvedValue({ id: 'grade-1', gradeLevel: 'GL-07', step: 5 }), findMany: jest.fn().mockResolvedValue([]) },
      staff: {
        findUnique:        jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeStaff()),
        findMany:          jest.fn().mockResolvedValue([]),
        create:            jest.fn().mockResolvedValue(makeStaff()),
        update:            jest.fn().mockResolvedValue(makeStaff()),
        count:             jest.fn().mockResolvedValue(0),
      },
      leaveRequest: {
        findFirst:         jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeLeave()),
        create:            jest.fn().mockResolvedValue(makeLeave()),
        update:            jest.fn().mockResolvedValue(makeLeave({ status: LeaveStatus.APPROVED })),
        findMany:          jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: Function) => fn(prisma)),
    } as never;
    audit = { log: jest.fn() } as unknown as jest.Mocked<AuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService,  useValue: audit },
      ],
    }).compile();
    svc = module.get<HrService>(HrService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── createStaff() — PII encryption ────────────────────────────────────────
  describe('createStaff() — PII encryption', () => {
    const dto = {
      userId: 'user-1', employeeNo: 'EMP001', firstName: 'Funmi', lastName: 'Adeyemi',
      dateOfBirth: '1985-03-12', gender: 'Female', phone: '08012345678',
      email: 'funmi@uni.edu.ng', designation: 'Lecturer I',
      departmentId: 'dept-1', salaryGradeId: 'grade-1', employmentType: 'FULL_TIME' as const,
      appointmentDate: '2015-01-01',
    };

    it('creates staff with ACTIVE employment status', async () => {
      await svc.createStaff(dto, 'hr-1');
      expect(prisma.staff.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ employmentStatus: EmploymentStatus.ACTIVE }),
      }));
    });

    it('encrypts rsaPin before storing (PII encryption)', async () => {
      await svc.createStaff({ ...dto, rsaPin: 'PEN123456789' }, 'hr-1');
      const createCall = (prisma.staff.create as jest.Mock).mock.calls[0][0];
      const storedPin  = createCall.data.rsaPin as string;
      // Encrypted value must NOT be the plaintext — it starts with 'v1:'
      expect(storedPin).not.toBe('PEN123456789');
      expect(storedPin).toMatch(/^v1:/);
    });

    it('encrypts accountNumber before storing (PII encryption)', async () => {
      await svc.createStaff({ ...dto, accountNumber: '0123456789' }, 'hr-1');
      const createCall = (prisma.staff.create as jest.Mock).mock.calls[0][0];
      const storedAcc  = createCall.data.accountNumber as string;
      expect(storedAcc).not.toBe('0123456789');
      expect(storedAcc).toMatch(/^v1:/);
    });

    it('stores null when rsaPin is not provided', async () => {
      await svc.createStaff(dto, 'hr-1');
      const createCall = (prisma.staff.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.rsaPin).toBeNull();
    });

    it('rejects duplicate employee number', async () => {
      prisma.staff.findUnique.mockResolvedValueOnce(makeStaff());
      await expect(svc.createStaff(dto, 'hr-1')).rejects.toThrow(ConflictException);
      expect(prisma.staff.create).not.toHaveBeenCalled();
    });
  });

  // ── requestLeave() — overlap detection ────────────────────────────────────
  describe('requestLeave() — overlap detection', () => {
    const dto = { leaveType: 'ANNUAL' as const, startDate: '2025-08-01', endDate: '2025-08-14', reason: 'Annual family vacation approved by HOD' };

    it('creates leave request when no overlap exists', async () => {
      const result = await svc.requestLeave(dto, 'staff-1');
      expect(result.leaveType).toBe('ANNUAL');
      expect(prisma.leaveRequest.create).toHaveBeenCalled();
    });

    it('rejects leave when an overlapping PENDING request exists', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValueOnce(makeLeave());
      await expect(svc.requestLeave(dto, 'staff-1')).rejects.toThrow(ConflictException);
      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('rejects leave when an overlapping APPROVED request exists', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValueOnce(makeLeave({ status: LeaveStatus.APPROVED }));
      await expect(svc.requestLeave(dto, 'staff-1')).rejects.toThrow(ConflictException);
    });

    it('rejects when end date is before start date', async () => {
      await expect(svc.requestLeave({ ...dto, startDate: '2025-08-14', endDate: '2025-08-01' }, 'staff-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('computes daysRequested correctly from date range', async () => {
      await svc.requestLeave(dto, 'staff-1');
      const createCall = (prisma.leaveRequest.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.daysRequested).toBe(13); // Aug 1 → Aug 14 = 13 days
    });
  });

  // ── decideLeave() — role-based guard ──────────────────────────────────────
  describe('decideLeave() — role-based guard', () => {
    it('HR_MANAGER can approve a PENDING leave request', async () => {
      const result = await svc.decideLeave('leave-1', { action: 'APPROVE' }, 'hr-1', 'HR_MANAGER');
      expect(result.status).toBe(LeaveStatus.APPROVED);
      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: LeaveStatus.APPROVED, approvedById: 'hr-1' }),
      }));
    });

    it('HOD can approve leave requests', async () => {
      await svc.decideLeave('leave-1', { action: 'APPROVE' }, 'hod-1', 'HOD');
      expect(prisma.leaveRequest.update).toHaveBeenCalled();
    });

    it('STAFF role cannot decide on leave requests', async () => {
      await expect(svc.decideLeave('leave-1', { action: 'APPROVE' }, 'staff-1', 'STAFF'))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.leaveRequest.update).not.toHaveBeenCalled();
    });

    it('STUDENT role cannot decide on leave requests', async () => {
      await expect(svc.decideLeave('leave-1', { action: 'APPROVE' }, 'stu-1', 'STUDENT'))
        .rejects.toThrow(ForbiddenException);
    });

    it('rejects deciding on already-decided leave', async () => {
      prisma.leaveRequest.findUniqueOrThrow.mockResolvedValueOnce(makeLeave({ status: LeaveStatus.APPROVED }));
      await expect(svc.decideLeave('leave-1', { action: 'APPROVE' }, 'hr-1', 'HR_MANAGER'))
        .rejects.toThrow(ConflictException);
    });

    it('APPROVE sets staff employmentStatus → ON_LEAVE', async () => {
      await svc.decideLeave('leave-1', { action: 'APPROVE' }, 'hr-1', 'HR_MANAGER');
      expect(prisma.staff.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { employmentStatus: EmploymentStatus.ON_LEAVE },
      }));
    });

    it('REJECT does NOT change employmentStatus', async () => {
      prisma.leaveRequest.update.mockResolvedValueOnce(makeLeave({ status: LeaveStatus.REJECTED }));
      await svc.decideLeave('leave-1', { action: 'REJECT', note: 'Insufficient notice period' }, 'hr-1', 'HR_MANAGER');
      expect(prisma.staff.update).not.toHaveBeenCalled();
    });
  });

  // ── retire() ──────────────────────────────────────────────────────────────
  describe('retire()', () => {
    it('sets employmentStatus → RETIRED and records retirementDate', async () => {
      await svc.retire('staff-1', 'hr-1');
      expect(prisma.staff.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ employmentStatus: EmploymentStatus.RETIRED }),
      }));
    });

    it('rejects retiring an already-retired staff member', async () => {
      prisma.staff.findUniqueOrThrow.mockResolvedValueOnce(makeStaff({ employmentStatus: EmploymentStatus.RETIRED }));
      await expect(svc.retire('staff-1', 'hr-1')).rejects.toThrow(BadRequestException);
    });
  });
});
