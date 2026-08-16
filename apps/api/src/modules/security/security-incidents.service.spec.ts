import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { QUEUE_NAMES } from '../../common/queue-names';
import { SecurityIncidentTypeDto } from './dto/security.dto';
import { SecurityIncidentsService } from './security-incidents.service';

const makeIncident = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'inc-1', type: 'CREDENTIAL_BREACH', description: 'Test breach',
  affectedUserIds: ['user-1', 'user-2'], reportedById: 'reporter-1',
  status: 'REPORTED', detectedAt: new Date('2026-07-01T00:00:00Z'),
  containedAt: null, nitdaNotifiedAt: null, resolvedAt: null, dpoNotes: null,
  ...o,
});

describe('SecurityIncidentsService', () => {
  let svc: SecurityIncidentsService;
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let audit: jest.Mocked<AuditService>;
  let outbox: jest.Mocked<OutboxService>;
  let breachQueue: { add: jest.Mock; removeRepeatableByKey: jest.Mock; getJob: jest.Mock };
  let txTables: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    txTables = {
      securityIncident: { create: jest.fn().mockResolvedValue(makeIncident()) },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(txTables)),
      securityIncident: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(makeIncident(data))),
        findUnique: jest.fn().mockResolvedValue(makeIncident()),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };

    audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;
    outbox = { write: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<OutboxService>;
    breachQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue({ remove: jest.fn().mockResolvedValue(undefined) }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityIncidentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
        { provide: getQueueToken(QUEUE_NAMES.BREACH_NOTIFICATION), useValue: breachQueue },
      ],
    }).compile();

    svc = module.get(SecurityIncidentsService);
  });

  describe('report()', () => {
    it('creates the incident, revokes sessions for a CREDENTIAL_BREACH, and writes to the outbox atomically', async () => {
      const dto = { type: SecurityIncidentTypeDto.CREDENTIAL_BREACH, description: 'Leaked password dump', affectedUserIds: ['user-1', 'user-2'] };

      const result = await svc.report(dto, 'reporter-1');

      expect(txTables.securityIncident.create).toHaveBeenCalled();
      expect(txTables.session.updateMany).toHaveBeenCalledWith({
        where: { userId: { in: ['user-1', 'user-2'] }, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // AUDIT-C1: the initial DPO/VC alert must go through the outbox, not
      // a direct queue.add('send-notification', ...) call — that job name
      // doesn't match what NotificationsProcessor listens for and was
      // silently dropped before this fix.
      expect(outbox.write).toHaveBeenCalledWith(
        txTables, 'security.incident_reported', expect.objectContaining({ incidentId: 'inc-1' }),
      );
      expect(result.nitdaDeadline).toEqual(new Date('2026-07-04T00:00:00Z')); // detectedAt + 72h
    });

    it('does NOT revoke sessions for a non-credential incident type', async () => {
      const dto = { type: SecurityIncidentTypeDto.DATA_LEAK, description: 'Exposed export', affectedUserIds: ['user-1'] };
      txTables.securityIncident.create.mockResolvedValue(makeIncident({ type: 'DATA_LEAK' }));

      await svc.report(dto, 'reporter-1');

      expect(txTables.session.updateMany).not.toHaveBeenCalled();
    });

    it('records a durable repeating NITDA reminder event keyed to the incident', async () => {
      const dto = { type: SecurityIncidentTypeDto.CREDENTIAL_BREACH, description: 'x', affectedUserIds: [] };

      await svc.report(dto, 'reporter-1');

      expect(outbox.write).toHaveBeenCalledWith(
        txTables, 'security.breach_reminder_requested',
        expect.objectContaining({ incidentId: 'inc-1', deadline: expect.any(String) }),
      );
      expect(breachQueue.add).not.toHaveBeenCalled();
    });

    it('still records the incident even when no DPO/VC recipient exists in the system', async () => {
      prisma.user.findMany.mockResolvedValue([]); // no VC, no dpo-scoped staff
      const dto = { type: SecurityIncidentTypeDto.CREDENTIAL_BREACH, description: 'x', affectedUserIds: [] };

      await expect(svc.report(dto, 'reporter-1')).resolves.toBeDefined();
      expect(txTables.securityIncident.create).toHaveBeenCalled(); // recorded regardless — see class doc: "escalate manually"
    });
  });

  describe('markNitdaNotified()', () => {
    it('stops the repeating reminder job and updates status', async () => {
      const result = await svc.markNitdaNotified('inc-1', 'dpo-1');

      expect(result.status).toBe('NITDA_NOTIFIED');
      expect(breachQueue.removeRepeatableByKey).toHaveBeenCalledWith('breach-inc-1');
      expect(breachQueue.getJob).toHaveBeenCalledWith('breach-inc-1');
      expect(audit.log).toHaveBeenCalled();
    });

    it('throws NotFoundException for a nonexistent incident', async () => {
      prisma.securityIncident.findUnique.mockResolvedValue(null);
      await expect(svc.markNitdaNotified('missing', 'dpo-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list()', () => {
    it('flags an incident as overdue once the 72h NITDA deadline has passed and it is not yet notified/resolved', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-05T00:00:00Z')); // 4 days after detectedAt
      prisma.securityIncident.findMany.mockResolvedValue([makeIncident({ status: 'REPORTED' })]);

      const [result] = await svc.list();

      expect(result.overdue).toBe(true);
      jest.useRealTimers();
    });

    it('does not flag a RESOLVED incident as overdue even past the deadline', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-05T00:00:00Z'));
      prisma.securityIncident.findMany.mockResolvedValue([makeIncident({ status: 'RESOLVED' })]);

      const [result] = await svc.list();

      expect(result.overdue).toBe(false);
      jest.useRealTimers();
    });
  });
});
