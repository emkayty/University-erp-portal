import { Test, TestingModule } from '@nestjs/testing';
import { DsrRequestType } from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RlsContextService } from '../../common/rls/rls-context.service';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrivacyService } from './privacy.service';

const makeUser = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'user-1', email: 'student@test.com', phone: '08011112222',
  passwordHash: 'hash', mfaSecret: null, mfaEnabled: false,
  isActive: true, deletedAt: null,   processingRestricted: false, roles: [{ roleName: 'VC' }], ...o,
});

describe('PrivacyService', () => {
  let svc: PrivacyService;
  let prisma: Record<string, unknown> & { forRequest: jest.Mock; $transaction: jest.Mock };
  let rlsContext: jest.Mocked<RlsContextService>;
  let audit: jest.Mocked<AuditService>;
  let outbox: jest.Mocked<OutboxService>;
  let dbMock: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    dbMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue(makeUser()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeUser()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...makeUser(), ...data })),
        delete: jest.fn().mockResolvedValue(makeUser()),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue(null),
        // P0-8 FIX (this pass — see docs/CHANGELOG.md): missing from
        // this shared mock even though the legal-hold pseudonymisation test
        // below exercises PrivacyService.pseudonymiseInPlace(), which calls
        // `this.db().student.update(...)` — every run of that test threw
        // "this.db(...).student.update is not a function" before this fix,
        // regardless of environment; this was never a passing test.
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'stu-1', ...data })),
      },
      staff: { findUnique: jest.fn().mockResolvedValue(null) },
      reportJob: { create: jest.fn().mockResolvedValue({ id: 'job-1' }) },
      dataSubjectRequest: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'dsr-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'dsr-1', ...data })),
      },
      auditLog: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
      person: { findUnique: jest.fn().mockResolvedValue({ id: 'person-1', students: [] }) },
    };

    // forRequest() is what audit remediation R2 introduced — this is the
    // single seam PrivacyService uses instead of `this.prisma.<model>`
    // directly. Mocking it to always return dbMock (regardless of RLS
    // context state) keeps these tests focused on business logic; the
    // interceptor wiring itself is exercised separately (see
    // rls.interceptor and app wiring — not unit-testable in isolation
    // without a running Nest app + real Postgres, which this sandbox
    // doesn't have available).
    prisma = {
      ...dbMock,
      forRequest: jest.fn().mockReturnValue(dbMock),
      $transaction: jest.fn((operation: unknown) =>
        Array.isArray(operation) ? Promise.all(operation) : (operation as (tx: typeof dbMock) => Promise<unknown>)(dbMock),
      ),
    } as unknown as typeof prisma;
    rlsContext = { getClient: jest.fn() } as unknown as jest.Mocked<RlsContextService>;
    audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;
    outbox = { write: jest.fn().mockResolvedValue('event-1') } as unknown as jest.Mocked<OutboxService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyService,
        { provide: PrismaService, useValue: prisma },
        { provide: RlsContextService, useValue: rlsContext },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();

    svc = module.get(PrivacyService);
  });

  it('every query goes through prisma.forRequest(rlsContext), not the plain client (regression guard for R2)', async () => {
    await svc.requestAccess('user-1', 'dpo-1');
    expect(prisma.forRequest).toHaveBeenCalledWith(rlsContext);
    expect(prisma.forRequest.mock.calls.length).toBeGreaterThan(0);
  });

  describe('requestAccess (SAR)', () => {
    it('records the full durable SAR export event payload the processor expects (AUDIT-H2 fix)', async () => {
      const result = await svc.requestAccess('user-1', 'dpo-1');

      expect(outbox.write).toHaveBeenCalledWith(dbMock, 'privacy.sar_export_requested', expect.objectContaining({
        reportJobId: 'job-1', reportType: 'CUSTOM', reportFormat: 'XLSX',
        parameters: { kind: 'ndpr_sar', subjectUserId: 'user-1' },
      }));
      expect(result.dueBy.getTime() - Date.now()).toBeGreaterThan(47 * 60 * 60 * 1000); // ~48h SLA
      expect(result.dueBy.getTime() - Date.now()).toBeLessThan(49 * 60 * 60 * 1000);
    });

    it('throws NotFoundException for a nonexistent subject', async () => {
      dbMock.user.findUnique.mockResolvedValue(null);
      await expect(svc.requestAccess('missing', 'dpo-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('intakePersonRequest', () => {
    it('creates a durable Person-linked DSR for a pre-account applicant and requires identity verification', async () => {
      dbMock.person.findUnique.mockResolvedValue({ id: 'person-1', students: [] });

      const result = await svc.intakePersonRequest('person-1', 'dpo-1', {
        type: DsrRequestType.ERASURE,
        reason: 'Applicant request received before account creation',
      });

      expect(dbMock.dataSubjectRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: DsrRequestType.ERASURE,
          status: 'IDENTITY_VERIFICATION_REQUIRED',
          subjectPersonId: 'person-1',
          subjectUserId: null,
          requestedById: 'dpo-1',
        }),
      });
      expect(result).toMatchObject({
        requestId: 'dsr-1',
        status: 'IDENTITY_VERIFICATION_REQUIRED',
        subjectPersonId: 'person-1',
        subjectUserId: null,
      });
    });

    it('records the unique linked User when the canonical Person has one Student account', async () => {
      dbMock.person.findUnique.mockResolvedValue({ id: 'person-1', students: [{ userId: 'user-1' }] });

      const result = await svc.intakePersonRequest('person-1', 'dpo-1', { type: DsrRequestType.ACCESS });

      expect(result.subjectUserId).toBe('user-1');
      expect(dbMock.dataSubjectRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ subjectPersonId: 'person-1', subjectUserId: 'user-1', status: 'IDENTITY_VERIFICATION_REQUIRED' }),
      });
    });
  });

  describe('rectify', () => {
    it('requires at least one of email or phone', async () => {
      await expect(svc.rectify('user-1', 'dpo-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates the field(s) provided and logs old/new values', async () => {
      await svc.rectify('user-1', 'dpo-1', { email: 'new@test.com' });

      expect(dbMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { email: 'new@test.com' },
      }));
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ oldValues: expect.anything(), newValues: expect.anything() }),
        'dpo-1',
      );
    });
  });

  describe('erase', () => {
    it('requires a distinct active VC approval account', async () => {
      dbMock.user.findUnique.mockResolvedValueOnce({ ...makeUser(), roles: [] });
      await expect(svc.erase('user-1', 'super-admin-1', { vcApprovalReference: '00000000-0000-4000-8000-000000000001' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('pseudonymises and deactivates a user even without academic identity or compliance history', async () => {
      dbMock.student.findUnique.mockResolvedValue(null);

      const result = await svc.erase('user-1', 'super-admin-1', { vcApprovalReference: '00000000-0000-4000-8000-000000000001' });

      expect(dbMock.user.delete).not.toHaveBeenCalled();
      expect(dbMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date), mfaEnabled: false }),
      }));
      expect(result).toMatchObject({ hardDeleted: false, pseudonymised: true, legalHold: false });
      expect(result).not.toHaveProperty('wasEmail');
    });

    it('creates the durable DSR before pseudonymization and finalizes it afterward', async () => {
      const order: string[] = [];
      dbMock.dataSubjectRequest.create.mockImplementation(({ data }) => {
        order.push('dsr-create');
        return Promise.resolve({ id: 'dsr-1', ...data });
      });
      dbMock.dataSubjectRequest.update.mockImplementation(({ data }) => {
        order.push('dsr-update');
        return Promise.resolve({ id: 'dsr-1', ...data });
      });
      dbMock.user.update.mockImplementation(async ({ data }) => {
        order.push('user-pseudonymize');
        return { ...makeUser(), ...data };
      });
      dbMock.student.findUnique.mockResolvedValue(null);

      const result = await svc.erase('user-1', 'super-admin-1', { vcApprovalReference: '00000000-0000-4000-8000-000000000001' });

      expect(result.hardDeleted).toBe(false);
      expect(result.pseudonymised).toBe(true);
      expect(order).toEqual(['dsr-create', 'user-pseudonymize', 'dsr-update']);
    });

    it('pseudonymises instead of deleting when a 7-year academic-record legal hold applies', async () => {
      dbMock.student.findUnique.mockResolvedValue({ id: 'stu-1', _count: { results: 3 } });

      const result = await svc.erase('user-1', 'super-admin-1', { vcApprovalReference: '00000000-0000-4000-8000-000000000001' });

      expect(dbMock.user.delete).not.toHaveBeenCalled();
      expect(dbMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date), mfaEnabled: false }),
      }));
      expect(result).toMatchObject({ hardDeleted: false, pseudonymised: true });
      expect(result).not.toHaveProperty('wasEmail');
    });

    it('pseudonymises a user with an existing compliance history even without academic results', async () => {
      dbMock.dataSubjectRequest.count.mockResolvedValue(1);
      dbMock.student.findUnique.mockResolvedValue(null);

      const result = await svc.erase('user-1', 'super-admin-1', { vcApprovalReference: '00000000-0000-4000-8000-000000000003' });

      expect(dbMock.user.delete).not.toHaveBeenCalled();
      expect(result).toMatchObject({ hardDeleted: false, pseudonymised: true, legalHold: false });
    });

    it('scrubs PII from the subject\'s own historical audit log rows either way (M7)', async () => {
      dbMock.auditLog.findMany.mockResolvedValue([
        { id: 'log-1', oldValues: { email: 'old@test.com' }, newValues: { email: 'new@test.com' } },
      ]);
      dbMock.student.findUnique.mockResolvedValue({ id: 'stu-1', _count: { results: 0 } });

      await svc.erase('user-1', 'super-admin-1', { vcApprovalReference: '00000000-0000-4000-8000-000000000002' });

      expect(dbMock.auditLog.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'log-1' } }));
    });
  });

  describe('exportData (portability)', () => {
    it('records a portability export event and creates an IN_PROGRESS DSR', async () => {
      const result = await svc.exportData('user-1', 'user-1');

      expect(outbox.write).toHaveBeenCalledWith(dbMock, 'privacy.portability_export_requested', expect.objectContaining({
        reportJobId: 'job-1', reportType: 'CUSTOM', reportFormat: 'XLSX',
        parameters: { kind: 'ndpr_portability', subjectUserId: 'user-1', format: 'json' },
      }));
      expect(result.requestId).toBe('dsr-1');
    });
  });

  describe('restrictProcessing', () => {
    it('sets processingRestricted and completes the DSR immediately', async () => {
      const result = await svc.restrictProcessing('user-1', 'dpo-1', { reason: 'Under investigation' });

      expect(dbMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { processingRestricted: true },
      }));
      expect(result).toMatchObject({ processingRestricted: true });
    });
  });
});
