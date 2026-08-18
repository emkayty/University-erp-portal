import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdmissionType, ApplicantStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrivateObjectStorageService } from '../../common/storage/private-object-storage.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../database/prisma.service';
import { DirectPrismaService } from '../../database/direct-prisma.service';
import { AdmissionsService } from './admissions.service';
import { decryptPii } from '@uniportal/utils';

// P0-9 FIX (this pass — see docs/CHANGELOG.md): openDate/closeDate
// used to be hardcoded to 2025-01-01/2025-12-31. That was valid when this
// test was written, but apply() compares against `new Date()` at CALL time
// — once the real clock crossed 2025-12-31, `now > cycle.closeDate` became
// true unconditionally, and EVERY test in this file (not just date-window
// tests) started failing at the same early rejection, masking the actual
// business rule each one meant to verify. Not environment-specific: this
// breaks on any machine once real time passes the hardcoded date, which it
// now has. Relative dates make the default cycle "currently open" no
// matter when the suite runs.
const DAY = 24 * 60 * 60 * 1000;
const makeCycle = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'cycle-1', academicYear: '2025/2026', cycleName: 'Main 2025',
  admissionType: AdmissionType.UTME, isActive: true,
  openDate: new Date(Date.now() - 180 * DAY), closeDate: new Date(Date.now() + 180 * DAY),
  utmeMinScore: 180, maxApplicants: null, ...o,
});

const makeApplicant = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'app-1', applicationNo: '20250UTME00001', firstName: 'Adewale', lastName: 'Ojo',
  email: 'adewale@test.com', phone: '08012345678',
  dateOfBirth: new Date('2003-06-15'), gender: 'Male', nationality: 'Nigerian',
  admissionType: AdmissionType.UTME, admissionCycleId: 'cycle-1',
  programmeChoice1Id: 'prog-1', programmeChoice2Id: null, programmeChoice3Id: null,
  jambRegNo: '12345678AB', jambScore: 220, jambVerified: true,
  status: ApplicantStatus.PENDING, student: null,
  admissionCycle: makeCycle(), application: null,
  deletedAt: null, createdAt: new Date(), updatedAt: new Date(), ...o,
});

describe('AdmissionsService', () => {
  let svc:   AdmissionsService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let outbox: jest.Mocked<OutboxService>;
  let audit:   jest.Mocked<AuditService>;

  beforeEach(async () => {
    process.env.ADMISSIONS_TRACKING_SECRET = 'test-admissions-tracking-secret-012345678901234567890123456789';
    const applicant = {
      findUniqueOrThrow: jest.fn().mockResolvedValue(makeApplicant()),
      findMany:          jest.fn().mockResolvedValue([]),
      findUnique:        jest.fn().mockResolvedValue(null),
      findFirst:         jest.fn().mockResolvedValue(null),
      create:            jest.fn().mockResolvedValue(makeApplicant()),
      update:            jest.fn().mockResolvedValue(makeApplicant()),
      count:             jest.fn().mockResolvedValue(0),
    };
    const auditLog = { create: jest.fn() };

    prisma = {
      admissionCycle: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeCycle()),
        findMany:          jest.fn().mockResolvedValue([]),
        create:            jest.fn(),
        update:            jest.fn(),
        updateMany:        jest.fn(),
        count:             jest.fn().mockResolvedValue(0),
        findFirst:         jest.fn().mockResolvedValue(null),
      },
      applicant,
      person: { create: jest.fn().mockResolvedValue({ id: 'person-1' }) },
      application: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'application-1' }), update: jest.fn(), },
      address: { create: jest.fn() },
      guardianContact: { create: jest.fn() },
      previousEducation: { createMany: jest.fn() },
      oLevelSitting: { create: jest.fn().mockResolvedValue({ id: 'sitting-1' }), deleteMany: jest.fn() },
      oLevelSubject: { createMany: jest.fn() },
      admissionRequirement: { findFirst: jest.fn().mockResolvedValue(null), upsert: jest.fn(), findMany: jest.fn() },
      admissionScreening: { create: jest.fn() },
      admissionDecision: { create: jest.fn() },
      admissionOffer: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), updateMany: jest.fn() },
      programme: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'prog-1', name: 'BSc CS' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'prog-1' }]),
      },
      auditLog,
      // AUDIT-C1 fix wrapped updateStatus() in $transaction — tx reuses the
      // same `applicant`/`auditLog` mock objects so existing assertions
      // against `prisma.applicant.update` still work.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({ applicant, auditLog, application: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'application-1' }) }, admissionDecision: { create: jest.fn() }, admissionOffer: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), updateMany: jest.fn() }, $executeRaw: jest.fn() })),
    };
    outbox = { write: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<OutboxService>;
    audit  = { log: jest.fn() }  as unknown as jest.Mocked<AuditService>;

    // Public applicant photograph upload dependency.
    const storage = {
      presignPost: jest.fn(),
      verifyObject: jest.fn(),
    };

    // Deep-audit fix (Aug 2026): generateApplicationNo() and
    // assertSuperAdminCap()-style methods now use DirectPrismaService's
    // advisory-lock pattern (see MatricNumberService, the original
    // reference implementation this was generalised from). This mock
    // mirrors prisma.$transaction's shape above — a raw SQL lock
    // statement is a no-op against a mock, and the callback reuses the
    // same `applicant` mock so `prisma.applicant.count` assertions
    // elsewhere in this file still work whether the real or direct
    // client's count mock fires.
    const direct = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({
        applicant,
        person: { create: jest.fn().mockResolvedValue({ id: 'person-1' }) },
        application: { create: jest.fn().mockResolvedValue({ id: 'application-1' }), findUnique: jest.fn().mockResolvedValue(null) },
        address: { create: jest.fn() },
        guardianContact: { create: jest.fn() },
        emergencyContact: { create: jest.fn() },
        previousEducation: { createMany: jest.fn() },
        oLevelSitting: { create: jest.fn().mockResolvedValue({ id: 'sitting-1' }) },
        oLevelSubject: { createMany: jest.fn() },
        $executeRaw: jest.fn().mockResolvedValue(undefined),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdmissionsService,
        { provide: PrismaService,       useValue: prisma },
        { provide: DirectPrismaService, useValue: direct },
        { provide: OutboxService,       useValue: outbox },
        { provide: AuditService,        useValue: audit },
        { provide: PrivateObjectStorageService, useValue: storage },
      ],
    }).compile();

    svc = module.get<AdmissionsService>(AdmissionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── createCycle ─────────────────────────────────────────────────────────────
  describe('createCycle()', () => {
    it('creates a cycle with valid data', async () => {
      prisma.admissionCycle.create.mockResolvedValue(makeCycle());
      const result = await svc.createCycle({
        academicYear: '2025/2026', cycleName: 'Main', admissionType: 'UTME' as never,
        openDate: '2025-09-01', closeDate: '2025-11-30',
      }, 'actor');
      expect(result).toBeDefined();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }), 'actor');
    });

    it('rejects invalid academic year format', async () => {
      await expect(svc.createCycle({
        academicYear: '2025-2026', cycleName: 'X', admissionType: 'UTME' as never,
        openDate: '2025-09-01', closeDate: '2025-11-30',
      }, 'actor')).rejects.toThrow('YYYY/YYYY');
    });

    it('rejects when close date is before open date', async () => {
      await expect(svc.createCycle({
        academicYear: '2025/2026', cycleName: 'X', admissionType: 'UTME' as never,
        openDate: '2025-11-30', closeDate: '2025-09-01',
      }, 'actor')).rejects.toThrow('Close date must be after open date');
    });
  });

  afterEach(() => {
    delete process.env.ADMISSIONS_TRACKING_SECRET;
    delete process.env.ENCRYPTION_KEY_HEX;
  });

  // ── public tracking ─────────────────────────────────────────────────────────
  describe('trackPublicApplication()', () => {
    it('returns status only with the valid issued tracking credential', async () => {
      prisma.applicant.findFirst.mockResolvedValue(makeApplicant({ application: { status: 'SUBMITTED', completionPercent: 60, submittedAt: new Date() } }));
      const crypto = await import('node:crypto');
      const token = crypto.createHmac('sha256', process.env.ADMISSIONS_TRACKING_SECRET!).update('20250UTME00001:adewale@test.com').digest('hex');
      const result = await svc.trackPublicApplication({ applicationNo: '20250UTME00001', trackingToken: token });
      expect(result.applicationNo).toBe('20250UTME00001');
      expect(result).not.toHaveProperty('email');
    });

    it('uses a generic not-found response for an invalid credential', async () => {
      prisma.applicant.findFirst.mockResolvedValue(makeApplicant());
      await expect(svc.trackPublicApplication({ applicationNo: '20250UTME00001', trackingToken: '0'.repeat(64) }))
        .rejects.toThrow('not found or tracking credential is invalid');
    });
  });

  // ── apply ───────────────────────────────────────────────────────────────────
  describe('apply()', () => {
    const validDto = {
      firstName: 'Adewale', lastName: 'Ojo', dateOfBirth: '2003-06-15',
      gender: 'Male', nationality: 'Nigerian', phone: '08012345678',
      email: 'adewale@test.com', admissionType: 'UTME' as never,
      admissionCycleId: 'cycle-1', programmeChoice1Id: 'prog-1',
      jambRegNo: '12345678AB', jambScore: 220, declarationAccepted: true,
    };

    it('creates application on valid input', async () => {
      prisma.applicant.create.mockResolvedValue(makeApplicant());
      const result = await svc.apply(validDto);
      expect(result.applicationNo).toBeDefined();
    });

    it('encrypts NIN at rest and excludes it from the public response', async () => {
      process.env.ENCRYPTION_KEY_HEX = '11'.repeat(32);
      const rawNin = '12345678901';
      const result = await svc.apply({ ...validDto, nin: rawNin, ninConsentAccepted: true });
      const storedNin = prisma.applicant.create.mock.calls[0]?.[0]?.data?.nin as string;
      expect(storedNin).toBeDefined();
      expect(storedNin).not.toBe(rawNin);
      expect(decryptPii(storedNin)).toBe(rawNin);
      expect(result).not.toHaveProperty('nin');
      delete process.env.ENCRYPTION_KEY_HEX;
    });

    it('rejects NIN submission without the privacy consent acknowledgment', async () => {
      await expect(svc.apply({ ...validDto, nin: '12345678901' }))
        .rejects.toThrow('NIN identity-verification privacy notice');
    });

    it('derives admission type from the selected cycle when the client omits it', async () => {
      prisma.applicant.create.mockResolvedValue(makeApplicant());
      const { admissionType: _ignored, ...cycleOnlyDto } = validDto;
      await svc.apply(cycleOnlyDto);
      expect(prisma.applicant.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ admissionType: AdmissionType.UTME }),
      }));
    });

    it('rejects a client admission type that conflicts with the selected cycle', async () => {
      await expect(svc.apply({ ...validDto, admissionType: 'DE' as never }))
        .rejects.toThrow('match the selected admission cycle');
    });

    it('rejects applicant under 16 years old', async () => {
      const youngDob = new Date();
      youngDob.setFullYear(youngDob.getFullYear() - 14);
      await expect(svc.apply({ ...validDto, dateOfBirth: youngDob.toISOString().split('T')[0]! }))
        .rejects.toThrow('16 years old');
    });

    it('rejects when cycle is not active', async () => {
      prisma.admissionCycle.findUniqueOrThrow.mockResolvedValue(makeCycle({ isActive: false }));
      await expect(svc.apply(validDto))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects when cycle capacity is reached', async () => {
      prisma.admissionCycle.findUniqueOrThrow.mockResolvedValue(makeCycle({ maxApplicants: 5 }));
      prisma.applicant.count.mockResolvedValue(5);
      await expect(svc.apply(validDto)).rejects.toThrow('capacity reached');
    });

    it('rejects when programme choices are the same', async () => {
      await expect(svc.apply({ ...validDto, programmeChoice2Id: 'prog-1' }))
        .rejects.toThrow('different');
    });

    it('records a durable JAMB verification event inside the application transaction', async () => {
      prisma.applicant.create.mockResolvedValue(makeApplicant());
      await svc.apply(validDto);
      expect(outbox.write).toHaveBeenCalledWith(
        expect.anything(), 'admissions.jamb_verification_requested',
        { applicantId: 'app-1', jambRegNo: '12345678AB' },
      );
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────────
  describe('updateStatus()', () => {
    it('transitions PENDING → SCREENED', async () => {
      prisma.applicant.update.mockResolvedValue(makeApplicant({ status: ApplicantStatus.SCREENED }));
      const result = await svc.updateStatus('app-1', { status: 'SCREENED' }, 'actor');
      expect(result.status).toBe(ApplicantStatus.SCREENED);
    });

    it('rejects invalid FSM transition (PENDING → OFFERED)', async () => {
      await expect(svc.updateStatus('app-1', { status: 'OFFERED' }, 'actor'))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('requires rejection reason on REJECTED status', async () => {
      prisma.applicant.findUniqueOrThrow.mockResolvedValue(makeApplicant({ status: ApplicantStatus.SCREENED }));
      await expect(svc.updateStatus('app-1', { status: 'REJECTED' }, 'actor'))
        .rejects.toThrow('required');
    });

    it('allows SCREENED → REJECTED with reason provided', async () => {
      prisma.applicant.findUniqueOrThrow.mockResolvedValue(makeApplicant({ status: ApplicantStatus.SCREENED }));
      prisma.applicant.update.mockResolvedValue(makeApplicant({ status: ApplicantStatus.REJECTED }));
      const result = await svc.updateStatus('app-1', {
        status: 'REJECTED', rejectionReason: 'Insufficient UTME score for programme',
      }, 'actor');
      expect(result.status).toBe(ApplicantStatus.REJECTED);
      expect(outbox.write).toHaveBeenCalledWith(expect.anything(), 'applicant.rejected', expect.any(Object));
    });
  });

  // ── screenBulk ────────────────────────────────────────────────────────────────
  describe('screenBulk()', () => {
    it('dry-run reports counts without saving', async () => {
      prisma.applicant.findMany.mockResolvedValue([
        makeApplicant({ jambVerified: true, jambScore: 200 }),
        makeApplicant({ id: 'app-2', jambVerified: true, jambScore: 150 }),
      ]);
      const result = await svc.screenBulk({ admissionCycleId: 'cycle-1', dryRun: true }, 'actor');
      expect(result.dryRun).toBe(true);
      expect(result.screened).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.skipped).toBe(2);
      expect(prisma.applicant.update).not.toHaveBeenCalled();
    });

    it('applies screening when dryRun=false', async () => {
      prisma.applicant.findMany.mockResolvedValue([
        makeApplicant({ jambVerified: true, jambScore: 200 }),
      ]);
      prisma.applicant.update.mockResolvedValue(makeApplicant({ status: ApplicantStatus.SCREENED }));
      const result = await svc.screenBulk({ admissionCycleId: 'cycle-1', dryRun: false }, 'actor');
      expect(result.dryRun).toBe(false);
      expect(prisma.applicant.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'app-1' }, data: { status: ApplicantStatus.REVIEW_REQUIRED } }));
    });

    it('routes applicants with unverified JAMB for UTME cycle to manual review', async () => {
      prisma.applicant.findMany.mockResolvedValue([
        makeApplicant({ jambVerified: false, jambScore: null }),
      ]);
      const result = await svc.screenBulk({ admissionCycleId: 'cycle-1', dryRun: false }, 'actor');
      expect(result.skipped).toBe(1);
      expect(prisma.applicant.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'app-1' }, data: { status: ApplicantStatus.REVIEW_REQUIRED },
      }));
    });

    it('does not persist screening rows during dry-run evaluation', async () => {
      prisma.applicant.findMany.mockResolvedValue([makeApplicant({ jambVerified: false, jambScore: null })]);
      await svc.screenBulk({ admissionCycleId: 'cycle-1', dryRun: true }, 'actor');
      expect(prisma.admissionScreening.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('configured O\'Level policy evaluation', () => {
    const evaluate = (results: unknown[], policy?: unknown) =>
      (svc as unknown as { evaluateOLevelEligibility: (rows: unknown[], p?: unknown) => unknown })
        .evaluateOLevelEligibility(results, policy);

    it('counts distinct credited subjects across combined sittings', () => {
      const result = evaluate([
        { subject: 'English Language', grade: 'C6', sittingNumber: 1 },
        { subject: 'Mathematics', grade: 'C6', sittingNumber: 1 },
        { subject: 'Biology', grade: 'C6', sittingNumber: 1 },
        { subject: 'English Language', grade: 'C6', sittingNumber: 2 },
        { subject: 'Mathematics', grade: 'C6', sittingNumber: 2 },
        { subject: 'Chemistry', grade: 'C6', sittingNumber: 2 },
      ]) as { eligible: boolean; creditCount: number };
      expect(result.creditCount).toBe(4);
      expect(result.eligible).toBe(false);
    });

    it('honors configured credit, sitting, language, and programme-subject rules', () => {
      const result = evaluate([
        { subject: 'English Language', grade: 'C6', sittingNumber: 1 },
        { subject: 'Physics', grade: 'C6', sittingNumber: 1 },
        { subject: 'Chemistry', grade: 'C6', sittingNumber: 1 },
      ], {
        minOLevelCredits: 3,
        maxOLevelSittings: 1,
        requireEnglish: true,
        requireMathematics: false,
        subjectRequirements: [{ subject: 'Biology', required: true, alternatives: ['Agricultural Science'] }],
      }) as { eligible: boolean; reasons: string[] };
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Required O'Level subject credit missing: Biology (Agricultural Science).");
    });
  });
});
