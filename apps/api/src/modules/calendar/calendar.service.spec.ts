import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CalendarStatus } from '@prisma/client';

import { CalendarEventTypeEnum } from './dto/calendar.dto';

import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../database/prisma.service';
import { CalendarService, CALENDAR_EVENTS } from './calendar.service';

const MOCK_CACHE = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
const CACHE_MGR  = { provide: 'CACHE_MANAGER', useValue: MOCK_CACHE };

const makeCalendar = (o: Partial<{ id: string; status: CalendarStatus; isActive: boolean; academicYear: string }> = {}) => ({
  id: 'cal-uuid', academicYear: '2025/2026',
  startDate: new Date('2025-09-01'), endDate: new Date('2026-07-31'),
  isActive: false, status: CalendarStatus.DRAFT,
  createdById: 'user-uuid', createdAt: new Date(), updatedAt: new Date(),
  suspendedAt: null, suspendedById: null, suspendedReason: null,
  resumedAt: null, resumedById: null, activatedAt: null, activatedById: null,
  ...o,
});

describe('CalendarService', () => {
  let svc:     CalendarService;
  let prisma:  {
    academicCalendar: Record<string, jest.Mock>; calendarEvent: Record<string, jest.Mock>;
    auditLog: Record<string, jest.Mock>; $transaction: jest.Mock;
  };
  let outbox:  jest.Mocked<OutboxService>;
  let audit:   jest.Mocked<AuditService>;

  beforeEach(async () => {
    const auditLog = { create: jest.fn() };
    const academicCalendar = {
      findUnique:         jest.fn(),
      findUniqueOrThrow:  jest.fn(),
      findFirst:          jest.fn().mockResolvedValue(null),
      findMany:           jest.fn().mockResolvedValue([]),
      create:             jest.fn(),
      update:             jest.fn(),
    };
    prisma  = {
      academicCalendar,
      calendarEvent: {
        create:           jest.fn(),
        delete:           jest.fn(),
        findFirstOrThrow: jest.fn(),
        findMany:         jest.fn().mockResolvedValue([]),
      },
      auditLog,
      // AUDIT-C1 fix added $transaction wrapping to activate/suspend/resume/
      // complete — the tx here REUSES the same academicCalendar/auditLog
      // mock objects (not fresh copies) so existing assertions against
      // `prisma.academicCalendar.update` keep working whether the real code
      // calls `this.prisma.X` or `tx.X`.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({ academicCalendar, auditLog })),
    };
    outbox  = { write: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<OutboxService>;
    audit   = { log: jest.fn() } as unknown as jest.Mocked<AuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        CACHE_MGR,
        { provide: PrismaService,   useValue: prisma },
        { provide: OutboxService,   useValue: outbox },
        { provide: AuditService,    useValue: audit },
      ],
    }).compile();

    svc = module.get<CalendarService>(CalendarService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create() ────────────────────────────────────────────────────────────────
  describe('create()', () => {
    it('creates a DRAFT calendar', async () => {
      prisma.academicCalendar.findUnique.mockResolvedValue(null);
      prisma.academicCalendar.create.mockResolvedValue(makeCalendar());

      const result = await svc.create({ academicYear: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' }, 'actor');

      expect(result.status).toBe(CalendarStatus.DRAFT);
      expect(prisma.academicCalendar.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: CalendarStatus.DRAFT, isActive: false }) }),
      );
    });

    it('rejects duplicate academic year', async () => {
      prisma.academicCalendar.findUnique.mockResolvedValue(makeCalendar());
      await expect(svc.create({ academicYear: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31' }, 'actor'))
        .rejects.toThrow(ConflictException);
    });

    it('rejects if end date is before start date', async () => {
      prisma.academicCalendar.findUnique.mockResolvedValue(null);
      await expect(svc.create({ academicYear: '2025/2026', startDate: '2025-09-01', endDate: '2025-08-01' }, 'actor'))
        .rejects.toThrow('End date must be after start date');
    });

    it('validates YYYY/YYYY academic year format', async () => {
      await expect(svc.create({ academicYear: '2025-2026', startDate: '2025-09-01', endDate: '2026-07-31' }, 'actor'))
        .rejects.toThrow('YYYY/YYYY');
    });

    it('validates end year = start year + 1', async () => {
      await expect(svc.create({ academicYear: '2025/2027', startDate: '2025-09-01', endDate: '2027-07-31' }, 'actor'))
        .rejects.toThrow('start + 1');
    });
  });

  // ── addEvent() ──────────────────────────────────────────────────────────────
  describe('addEvent()', () => {
    const base = { name: 'Registration', isPublic: true };

    it('rejects an event whose end date precedes its start date', async () => {
      await expect(svc.addEvent('cal-uuid', {
        ...base,
        eventType: CalendarEventTypeEnum.OTHER,
        startDate: '2026-01-20',
        endDate: '2026-01-10',
      }, 'actor')).rejects.toThrow('must not be before');
      expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
    });

    it('rejects a registration close that precedes every opening event', async () => {
      prisma.calendarEvent.findMany.mockResolvedValue([
        { eventType: CalendarEventTypeEnum.REGISTRATION_OPEN, startDate: new Date('2026-02-01'), endDate: null },
      ]);
      await expect(svc.addEvent('cal-uuid', {
        ...base,
        eventType: CalendarEventTypeEnum.REGISTRATION_CLOSE,
        startDate: '2026-01-20',
      }, 'actor')).rejects.toThrow('must not precede');
    });

    it('rejects duplicate registration events at the same start date', async () => {
      prisma.calendarEvent.findMany.mockResolvedValue([
        { eventType: CalendarEventTypeEnum.REGISTRATION_OPEN, startDate: new Date('2026-01-10'), endDate: null },
      ]);
      await expect(svc.addEvent('cal-uuid', {
        ...base,
        eventType: CalendarEventTypeEnum.REGISTRATION_OPEN,
        startDate: '2026-01-10',
      }, 'actor')).rejects.toThrow('Duplicate registration event');
    });

    it('rejects an open range that extends past its close event', async () => {
      prisma.calendarEvent.findMany.mockResolvedValue([
        { eventType: CalendarEventTypeEnum.REGISTRATION_CLOSE, startDate: new Date('2026-01-15'), endDate: null },
      ]);
      await expect(svc.addEvent('cal-uuid', {
        ...base,
        eventType: CalendarEventTypeEnum.REGISTRATION_OPEN,
        startDate: '2026-01-10',
        endDate: '2026-01-20',
      }, 'actor')).rejects.toThrow('must end on or before');
    });
  });

  // ── activate() ─────────────────────────────────────────────────────────────
  describe('activate()', () => {
    it('transitions DRAFT → ACTIVE and sets isActive=true', async () => {
      prisma.academicCalendar.findUniqueOrThrow.mockResolvedValue(makeCalendar({ status: CalendarStatus.DRAFT }));
      prisma.academicCalendar.findFirst.mockResolvedValue(null);
      prisma.academicCalendar.update.mockResolvedValue(makeCalendar({ status: CalendarStatus.ACTIVE, isActive: true }));

      await svc.activate('cal-uuid', 'actor');

      expect(prisma.academicCalendar.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: CalendarStatus.ACTIVE, isActive: true }),
      }));
      expect(outbox.write).toHaveBeenCalledWith(expect.anything(), CALENDAR_EVENTS.ACTIVATED, expect.any(Object));
      expect(MOCK_CACHE.del).toHaveBeenCalled();
    });

    it('rejects activation if another calendar is already active', async () => {
      prisma.academicCalendar.findUniqueOrThrow.mockResolvedValue(makeCalendar({ status: CalendarStatus.DRAFT }));
      prisma.academicCalendar.findFirst.mockResolvedValue(makeCalendar({ status: CalendarStatus.ACTIVE, isActive: true }));

      await expect(svc.activate('cal-uuid', 'actor'))
        .rejects.toThrow(ConflictException);
      expect(prisma.academicCalendar.update).not.toHaveBeenCalled();
    });

    it('rejects if calendar is not DRAFT', async () => {
      prisma.academicCalendar.findUniqueOrThrow.mockResolvedValue(makeCalendar({ status: CalendarStatus.COMPLETED }));
      await expect(svc.activate('cal-uuid', 'actor'))
        .rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ── suspend() ─────────────────────────────────────────────────────────────
  describe('suspend()', () => {
    it('transitions ACTIVE → SUSPENDED and sets isActive=false', async () => {
      prisma.academicCalendar.findUniqueOrThrow.mockResolvedValue(makeCalendar({ status: CalendarStatus.ACTIVE, isActive: true }));
      prisma.academicCalendar.update.mockResolvedValue(makeCalendar({ status: CalendarStatus.SUSPENDED, isActive: false }));

      await svc.suspend('cal-uuid', { reason: 'ASUU industrial action — strike effective 15 March' }, 'actor');

      expect(prisma.academicCalendar.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: CalendarStatus.SUSPENDED, isActive: false }),
      }));
      expect(outbox.write).toHaveBeenCalledWith(expect.anything(), CALENDAR_EVENTS.SUSPENDED, expect.any(Object));
    });

    it('rejects if calendar is not ACTIVE', async () => {
      prisma.academicCalendar.findUniqueOrThrow.mockResolvedValue(makeCalendar({ status: CalendarStatus.DRAFT }));
      await expect(svc.suspend('cal-uuid', { reason: 'ASUU strike — 10+ chars' }, 'actor'))
        .rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ── resume() ───────────────────────────────────────────────────────────────
  describe('resume()', () => {
    it('transitions SUSPENDED → ACTIVE and restores isActive=true', async () => {
      prisma.academicCalendar.findUniqueOrThrow.mockResolvedValue(makeCalendar({ status: CalendarStatus.SUSPENDED }));
      prisma.academicCalendar.update.mockResolvedValue(makeCalendar({ status: CalendarStatus.ACTIVE, isActive: true }));

      await svc.resume('cal-uuid', 'actor');

      expect(prisma.academicCalendar.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: CalendarStatus.ACTIVE, isActive: true }),
      }));
      expect(outbox.write).toHaveBeenCalledWith(expect.anything(), CALENDAR_EVENTS.RESUMED, expect.any(Object));
    });

    it('rejects if calendar is not SUSPENDED', async () => {
      prisma.academicCalendar.findUniqueOrThrow.mockResolvedValue(makeCalendar({ status: CalendarStatus.DRAFT }));
      await expect(svc.resume('cal-uuid', 'actor')).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ── requireActiveCalendar() ────────────────────────────────────────────────
  describe('requireActiveCalendar()', () => {
    it('throws BUSINESS_RULE_CALENDAR_INACTIVE when no active calendar', async () => {
      MOCK_CACHE.get.mockResolvedValue(null);
      prisma.academicCalendar.findFirst.mockResolvedValue(null);
      await expect(svc.requireActiveCalendar()).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws with SUSPENDED message when calendar is suspended', async () => {
      MOCK_CACHE.get.mockResolvedValue({ id: 'cal-uuid', academicYear: '2025/2026', status: 'SUSPENDED' });
      await expect(svc.requireActiveCalendar()).rejects.toMatchObject({
        response: expect.objectContaining({ message: expect.stringContaining('suspended') }),
      });
    });

    it('returns active calendar when status is ACTIVE', async () => {
      MOCK_CACHE.get.mockResolvedValue({ id: 'cal-uuid', academicYear: '2025/2026', status: 'ACTIVE' });
      const result = await svc.requireActiveCalendar();
      expect(result.id).toBe('cal-uuid');
    });
  });
});
