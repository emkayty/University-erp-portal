import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { ClearanceService } from './clearance.service';

const makeItem = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'item-1', name: 'Fees Clearance', responsibleRole: 'BURSAR',
  isRequiredForGraduation: true, isAutoCleared: true, isActive: true,
  sortOrder: 1, createdAt: new Date(), ...o,
});

describe('ClearanceService', () => {
  let svc: ClearanceService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    prisma = {
      clearanceItem: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(makeItem()),
        create: jest.fn().mockResolvedValue(makeItem()),
      },
      studentClearance: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'sc-1', ...create })),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-student-1' }),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClearanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    svc = module.get(ClearanceService);
  });

  describe('getStudentClearance — graduation eligibility', () => {
    // AUDIT-H3 (partially fixed): documented gap from docs/CHANGELOG.md
    // — "Clearance has no seeded default items in a truly fresh environment
    // until `prisma db seed` is run... without that, eligibleForGraduation
    // evaluates vacuously true against an empty checklist." This test makes
    // that behavior explicit and regression-checked rather than a fact only
    // documented in prose — if seeding is ever made non-mandatory (e.g. an
    // "auto-clear if no items configured" shortcut is added elsewhere),
    // this test will fail and force the assumption to be revisited.
    it('is vacuously TRUE when no clearance items exist (unseeded environment) — known gap, not a fix', async () => {
      prisma.clearanceItem.findMany.mockResolvedValue([]);
      prisma.studentClearance.findMany.mockResolvedValue([]);

      const result = await svc.getStudentClearance('stu-1', 'user-student-1', 'STUDENT');

      expect(result.checklist).toHaveLength(0);
      expect(result.eligibleForGraduation).toBe(true); // vacuous truth over an empty set — see note above
    });

    it('is FALSE when a required item is still PENDING', async () => {
      prisma.clearanceItem.findMany.mockResolvedValue([makeItem()]);
      prisma.studentClearance.findMany.mockResolvedValue([]);

      const result = await svc.getStudentClearance('stu-1', 'user-student-1', 'STUDENT');

      expect(result.eligibleForGraduation).toBe(false);
    });

    it('is TRUE when every required item is CLEARED or WAIVED', async () => {
      prisma.clearanceItem.findMany.mockResolvedValue([
        makeItem({ id: 'item-1' }),
        makeItem({ id: 'item-2', name: 'Library Clearance' }),
      ]);
      prisma.studentClearance.findMany.mockResolvedValue([
        { clearanceItemId: 'item-1', status: 'CLEARED', clearedAt: new Date(), blockReason: null, waiverReason: null },
        { clearanceItemId: 'item-2', status: 'WAIVED', clearedAt: null, blockReason: null, waiverReason: 'VC exception' },
      ]);

      const result = await svc.getStudentClearance('stu-1', 'user-student-1', 'STUDENT');

      expect(result.eligibleForGraduation).toBe(true);
    });

    it('a non-required item being BLOCKED does not affect eligibility', async () => {
      prisma.clearanceItem.findMany.mockResolvedValue([
        makeItem({ id: 'item-1', isRequiredForGraduation: false }),
      ]);
      prisma.studentClearance.findMany.mockResolvedValue([
        { clearanceItemId: 'item-1', status: 'BLOCKED', clearedAt: null, blockReason: 'unpaid fine', waiverReason: null },
      ]);

      const result = await svc.getStudentClearance('stu-1', 'user-student-1', 'STUDENT');

      expect(result.eligibleForGraduation).toBe(true);
    });

    it('a STUDENT may only view their own clearance', async () => {
      prisma.student.findUnique.mockResolvedValue({ userId: 'someone-else' });

      await expect(
        svc.getStudentClearance('stu-1', 'user-student-1', 'STUDENT'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('staff roles (e.g. REGISTRAR) may view any student\'s clearance', async () => {
      await expect(
        svc.getStudentClearance('stu-1', 'staff-user-1', 'REGISTRAR'),
      ).resolves.toBeDefined();
      expect(prisma.student.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('clearItem / blockItem — RBAC', () => {
    it('the responsible role may clear its own item', async () => {
      const result = await svc.clearItem('stu-1', 'item-1', 'bursar-1', 'BURSAR');
      expect(result).toMatchObject({ status: 'CLEARED' });
      expect(audit.log).toHaveBeenCalled();
    });

    it('REGISTRAR may act on any item regardless of responsibleRole', async () => {
      await expect(svc.clearItem('stu-1', 'item-1', 'reg-1', 'REGISTRAR')).resolves.toBeDefined();
    });

    it('a role that is not the responsible role and not REGISTRAR/SUPER_ADMIN is forbidden', async () => {
      await expect(
        svc.clearItem('stu-1', 'item-1', 'hostel-staff-1', 'HOD'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for a nonexistent clearance item', async () => {
      prisma.clearanceItem.findUnique.mockResolvedValue(null);
      await expect(
        svc.clearItem('stu-1', 'missing-item', 'bursar-1', 'BURSAR'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blocking an item requires a blockReason and records who blocked it', async () => {
      const result = await svc.blockItem(
        'stu-1', 'item-1', { blockReason: 'Outstanding library fine' }, 'staff-1', 'BURSAR',
      );
      expect(result).toMatchObject({ status: 'BLOCKED', blockReason: 'Outstanding library fine' });
    });
  });

  describe('waiveItem — VC-only', () => {
    it('SUPER_ADMIN and VC may waive; everyone else is forbidden', async () => {
      await expect(
        svc.waiveItem('stu-1', 'item-1', { waiverReason: 'medical exception' }, 'vc-1', 'VC'),
      ).resolves.toMatchObject({ status: 'WAIVED' });

      await expect(
        svc.waiveItem('stu-1', 'item-1', { waiverReason: 'x' }, 'registrar-1', 'REGISTRAR'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
