import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException, ConflictException,
  Inject, Injectable, Logger, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, CalendarStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import type { CreateCalendarDto, CreateCalendarEventDto, SuspendCalendarDto } from './dto/calendar.dto';

export const ACTIVE_CALENDAR_CACHE_KEY = 'calendar:active';
const CACHE_TTL = 300_000; // 5 minutes

// Internal event-type constants — event NAMES only now (C1 fix removed the
// EventEmitter2-specific wrapper classes; outbox.write() takes a plain
// payload object, and NotificationsProcessor's switch matches on these
// string constants).
export const CALENDAR_EVENTS = {
  ACTIVATED:  'calendar.activated',
  SUSPENDED:  'calendar.suspended',
  RESUMED:    'calendar.resumed',
  COMPLETED:  'calendar.completed',
} as const;

/**
 * CalendarService — manages the AcademicCalendar FSM.
 *
 * State machine:
 *   DRAFT → ACTIVE     (activate)      Only one ACTIVE calendar at a time (DB partial unique index)
 *   ACTIVE → SUSPENDED (suspend)       ASUU strike or emergency; requires reason
 *   SUSPENDED → ACTIVE (resume)        Operations restored
 *   ACTIVE → COMPLETED (complete)      End of academic year
 *
 * Cascade on SUSPEND: modules that require ACTIVE calendar return
 *   422 BUSINESS_RULE_CALENDAR_INACTIVE — enforced by CalendarGuard (common/guards).
 *
 * Cache: active calendar cached in Redis (5 min TTL); busted on every FSM transition.
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly audit:    AuditService,
    private readonly outbox:   OutboxService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async create(dto: CreateCalendarDto, actorId: string) {
    this.validateAcademicYearFormat(dto.academicYear);
    const start = new Date(dto.startDate);
    const end   = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException('End date must be after start date');

    const existing = await this.prisma.academicCalendar.findUnique({
      where: { academicYear: dto.academicYear },
    });
    if (existing) {
      throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: `Calendar for ${dto.academicYear} already exists` });
    }

    const calendar = await this.prisma.academicCalendar.create({
      data: {
        academicYear: dto.academicYear,
        startDate:    start,
        endDate:      end,
        status:       CalendarStatus.DRAFT,
        isActive:     false,
        createdById:  actorId,
      },
    });

    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'academic_calendars', targetId: calendar.id, newValues: { academicYear: dto.academicYear } }, actorId);
    return calendar;
  }

  async findAll() {
    return this.prisma.academicCalendar.findMany({
      include: { events: { orderBy: { startDate: 'asc' } } },
      orderBy: { academicYear: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.academicCalendar.findUniqueOrThrow({
      where:   { id },
      include: { events: { orderBy: { startDate: 'asc' } } },
    });
  }

  async getActive() {
    const cached = await this.cache.get(ACTIVE_CALENDAR_CACHE_KEY);
    if (cached) return cached;

    const calendar = await this.prisma.academicCalendar.findFirst({
      where:   { isActive: true },
      include: { events: true },
    });

    if (calendar) await this.cache.set(ACTIVE_CALENDAR_CACHE_KEY, calendar, CACHE_TTL);
    return calendar;
  }

  // ── FSM Transitions ───────────────────────────────────────────────────────
  async activate(id: string, actorId: string) {
    const calendar = await this.prisma.academicCalendar.findUniqueOrThrow({ where: { id } });

    if (calendar.status !== CalendarStatus.DRAFT) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot activate calendar with status "${calendar.status}". Only DRAFT calendars can be activated.`,
      });
    }

    // Check no other calendar is ACTIVE — extra safety layer (DB partial index is primary guard)
    const alreadyActive = await this.prisma.academicCalendar.findFirst({ where: { isActive: true } });
    if (alreadyActive) {
      throw new ConflictException({
        code: 'DUPLICATE_RESOURCE',
        message: `Calendar "${alreadyActive.academicYear}" is already active. Complete or deactivate it first.`,
      });
    }

    const activated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.academicCalendar.update({
        where: { id },
        data:  { status: CalendarStatus.ACTIVE, isActive: true, activatedAt: new Date(), activatedById: actorId },
      });
      await tx.auditLog.create({
        data: { actorId, action: AuditAction.UPDATE, targetTable: 'academic_calendars', targetId: id, newValues: { status: 'ACTIVE' } },
      });
      // C1 fix: was this.emitter.emit(...) — nothing was listening (zero
      // @OnEvent handlers exist in this codebase) and even if something
      // were, emit() outside a transaction isn't durable. Outbox write
      // commits atomically with the status change; NotificationsProcessor
      // has a 'calendar.activated' case (see notifications.processor.ts).
      await this.outbox.write(tx, CALENDAR_EVENTS.ACTIVATED, { calendarId: id, academicYear: calendar.academicYear });
      return updated;
    });

    await this.bustCache();
    this.logger.log(`Calendar ${calendar.academicYear} ACTIVATED by ${actorId}`);
    return activated;
  }

  async suspend(id: string, dto: SuspendCalendarDto, actorId: string) {
    const calendar = await this.prisma.academicCalendar.findUniqueOrThrow({ where: { id } });

    if (calendar.status !== CalendarStatus.ACTIVE) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot suspend calendar with status "${calendar.status}". Only ACTIVE calendars can be suspended.`,
      });
    }

    const suspended = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.academicCalendar.update({
        where: { id },
        data:  {
          status:          CalendarStatus.SUSPENDED,
          isActive:        false, // Blocks CalendarGuard immediately
          suspendedAt:     new Date(),
          suspendedById:   actorId,
          suspendedReason: dto.reason,
        },
      });
      await tx.auditLog.create({
        data: { actorId, action: AuditAction.SUSPEND, targetTable: 'academic_calendars', targetId: id, newValues: { status: 'SUSPENDED', reason: dto.reason } },
      });
      // C1 fix — see activate() comment. This one matters most: an ASUU
      // strike suspension with no working notification path means staff
      // and students find out the calendar is suspended only by hitting a
      // 422 on whatever they were trying to do next.
      await this.outbox.write(tx, CALENDAR_EVENTS.SUSPENDED, { calendarId: id, reason: dto.reason });
      return updated;
    });

    await this.bustCache();
    this.logger.warn(`Calendar ${calendar.academicYear} SUSPENDED by ${actorId}. Reason: ${dto.reason}`);
    return suspended;
  }

  async resume(id: string, actorId: string) {
    const calendar = await this.prisma.academicCalendar.findUniqueOrThrow({ where: { id } });

    if (calendar.status !== CalendarStatus.SUSPENDED) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot resume calendar with status "${calendar.status}". Only SUSPENDED calendars can be resumed.`,
      });
    }

    const resumed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.academicCalendar.update({
        where: { id },
        data:  { status: CalendarStatus.ACTIVE, isActive: true, resumedAt: new Date(), resumedById: actorId },
      });
      await tx.auditLog.create({
        data: { actorId, action: AuditAction.RESUME, targetTable: 'academic_calendars', targetId: id, newValues: { status: 'ACTIVE', resumedAt: new Date() } },
      });
      await this.outbox.write(tx, CALENDAR_EVENTS.RESUMED, { calendarId: id });
      return updated;
    });

    await this.bustCache();
    this.logger.log(`Calendar ${calendar.academicYear} RESUMED by ${actorId}`);
    return resumed;
  }

  async complete(id: string, actorId: string) {
    const calendar = await this.prisma.academicCalendar.findUniqueOrThrow({ where: { id } });

    if (calendar.status !== CalendarStatus.ACTIVE) {
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Only ACTIVE calendars can be completed.' });
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.academicCalendar.update({
        where: { id },
        data:  { status: CalendarStatus.COMPLETED, isActive: false },
      });
      await tx.auditLog.create({
        data: { actorId, action: AuditAction.UPDATE, targetTable: 'academic_calendars', targetId: id, newValues: { status: 'COMPLETED' } },
      });
      await this.outbox.write(tx, CALENDAR_EVENTS.COMPLETED, { calendarId: id });
      return updated;
    });

    await this.bustCache();
    return completed;
  }

  // ── Events ────────────────────────────────────────────────────────────────
  async addEvent(calendarId: string, dto: CreateCalendarEventDto, actorId: string) {
    await this.prisma.academicCalendar.findUniqueOrThrow({ where: { id: calendarId } });
    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    if (endDate && endDate < startDate) {
      throw new BadRequestException('Calendar event end date must not be before its start date.');
    }

    if (dto.eventType === 'REGISTRATION_OPEN' || dto.eventType === 'REGISTRATION_CLOSE') {
      const existing = await this.prisma.calendarEvent.findMany({
        where: { academicCalendarId: calendarId, eventType: { in: ['REGISTRATION_OPEN', 'REGISTRATION_CLOSE'] } },
        orderBy: { startDate: 'asc' },
      });
      const candidate = { eventType: dto.eventType, startDate, endDate };
      const events = [...existing, candidate].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      const opens = events.filter((event) => event.eventType === 'REGISTRATION_OPEN');
      const closes = events.filter((event) => event.eventType === 'REGISTRATION_CLOSE');

      if (events.filter((event) => event.eventType === dto.eventType && event.startDate.getTime() === startDate.getTime()).length > 1) {
        throw new ConflictException('Duplicate registration event at the same start date is not allowed.');
      }
      if (closes.some((close) => !opens.some((open) => open.startDate <= close.startDate))) {
        throw new BadRequestException('A registration close event must not precede its opening event.');
      }
      for (const open of opens) {
        const nextOpen = opens.find((candidateOpen) => candidateOpen.startDate > open.startDate);
        const candidateCloses = closes.filter((close) => close.startDate >= open.startDate && (!nextOpen || close.startDate < nextOpen.startDate));
        if (candidateCloses.length > 1) {
          throw new ConflictException('Each registration period must have exactly one close event.');
        }
        const close = candidateCloses[0];
        if (close && open.endDate && open.endDate > close.startDate) {
          throw new BadRequestException('A registration open range must end on or before its close event.');
        }
      }
    }

    const event = await this.prisma.calendarEvent.create({
      data: {
        academicCalendarId: calendarId,
        name:               dto.name,
        eventType:          dto.eventType as never,
        startDate,
        endDate,
        isPublic:           dto.isPublic ?? true,
        description:        dto.description ?? null,
      },
    });

    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'calendar_events', targetId: event.id, newValues: { name: dto.name, eventType: dto.eventType } }, actorId);
    return event;
  }

  async removeEvent(calendarId: string, eventId: string, actorId: string) {
    await this.prisma.calendarEvent.findFirstOrThrow({ where: { id: eventId, academicCalendarId: calendarId } });
    await this.prisma.calendarEvent.delete({ where: { id: eventId } });
    await this.audit.log({ action: AuditAction.DELETE, targetTable: 'calendar_events', targetId: eventId }, actorId);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  async requireActiveCalendar(): Promise<{ id: string; academicYear: string }> {
    const calendar = await this.getActive() as { id: string; academicYear: string; status: string } | null;
    if (!calendar || calendar.status !== 'ACTIVE') {
      throw new UnprocessableEntityException({
        code:    'BUSINESS_RULE_CALENDAR_INACTIVE',
        message: 'No active academic calendar. Operations are suspended.',
      });
    }
    return calendar;
  }

  private validateAcademicYearFormat(year: string): void {
    if (!/^\d{4}\/\d{4}$/.test(year)) {
      throw new BadRequestException('Academic year must be in "YYYY/YYYY" format e.g. "2025/2026"');
    }
    const [start, end] = year.split('/').map(Number) as [number, number];
    if (end !== start + 1) {
      throw new BadRequestException('Academic year end must be exactly start + 1 e.g. "2025/2026"');
    }
  }

  private async bustCache(): Promise<void> {
    await this.cache.del(ACTIVE_CALENDAR_CACHE_KEY);
  }
}
