import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { QUEUE_NAMES } from '../../common/queue-names';
import type { CreateSecurityIncidentDto, ResolveIncidentDto } from './dto/security.dto';

const NITDA_DEADLINE_HOURS = 72; // spec §16.1: "breach notification T+72h to NITDA"

/**
 * SecurityIncidentsService — NDPR breach-notification workflow (spec §16.1).
 *
 * IMPORTANT: NITDA has no public API to submit breach notifications to
 * (same situation as the GIFMIS federal TSA API noted elsewhere in
 * docs/CHANGELOG.md — institution-level onboarding/MOU required before
 * any such integration could exist). "nitda-notification" is therefore an
 * ESCALATING REMINDER job, not an auto-submission — it repeatedly alerts the
 * DPO/VC as the T+72h deadline approaches. A human DPO performs the actual
 * regulatory filing out-of-band and then calls markNitdaNotified() to stop
 * the clock. Do not mistake queue completion for regulatory compliance.
 *
 * AUDIT-C1 FIX: the initial DPO/VC alert on report() used to call
 * `notificationsQueue.add('send-notification', {...})` directly — the
 * wrong job name/shape for what NotificationsProcessor actually listens
 * for ('deliver-domain-event', produced only by OutboxService's cron), so
 * it was silently dropped. Now routed through the outbox, atomic with the
 * incident row's creation. The repeating reminder is also recorded as a
 * durable outbox event; the BREACH_NOTIFICATION queue remains the dedicated
 * execution and cancellation mechanism for that event.
 */
@Injectable()
export class SecurityIncidentsService {
  private readonly logger = new Logger(SecurityIncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    @InjectQueue(QUEUE_NAMES.BREACH_NOTIFICATION) private readonly breachQueue: Queue,
  ) {}

  /** POST /security/incidents — implements spec §16.1 handleBreach(). */
  async report(dto: CreateSecurityIncidentDto, reportedById: string) {
    const recipientIds = await this.findDpoAndVcRecipients();
    if (recipientIds.length === 0) {
      this.logger.error(
        'Reporting a security incident with NO VC or DPO-scoped user found in the system — ' +
        'the incident will still be recorded, but no one will be alerted through this system. Escalate manually.',
      );
    }

    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.securityIncident.create({
        data: {
          type: dto.type, description: dto.description,
          affectedUserIds: dto.affectedUserIds, reportedById,
        },
      });

      if (dto.type === 'CREDENTIAL_BREACH' && dto.affectedUserIds.length > 0) {
        const { count } = await tx.session.updateMany({
          where: { userId: { in: dto.affectedUserIds }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.warn(`Credential breach ${created.id}: revoked ${count} active session(s)`);
      }

      await tx.auditLog.create({
        data: {
          actorId: reportedById, action: AuditAction.CREATE, targetTable: 'security_incidents', targetId: created.id,
          newValues: { type: created.type, affectedCount: dto.affectedUserIds.length },
        },
      });

      const deadline = new Date(created.detectedAt.getTime() + NITDA_DEADLINE_HOURS * 60 * 60 * 1000);
      await this.outbox.write(tx, 'security.incident_reported', {
        incidentId: created.id, type: created.type, detectedAt: created.detectedAt,
        deadline: deadline.toISOString(), recipientIds,
      });
      await this.outbox.write(tx, 'security.breach_reminder_requested', {
        incidentId: created.id, deadline: deadline.toISOString(),
      });

      return created;
    });

    const deadline = new Date(incident.detectedAt.getTime() + NITDA_DEADLINE_HOURS * 60 * 60 * 1000);

    // The repeating reminder is now scheduled by the durable outbox event
    // written in the same transaction as the incident. This avoids a crash
    // window between incident commit and queue registration.

    return { ...incident, nitdaDeadline: deadline };
  }

  async contain(incidentId: string, actorId: string) {
    const incident = await this.getOrThrow(incidentId);
    const updated = await this.prisma.securityIncident.update({
      where: { id: incidentId }, data: { status: 'CONTAINED', containedAt: new Date() },
    });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'security_incidents', targetId: incidentId,
      oldValues: { status: incident.status }, newValues: { status: 'CONTAINED' },
    }, actorId);
    return updated;
  }

  /** Human DPO confirms the out-of-band NITDA filing is done — stops the reminder job. */
  async markNitdaNotified(incidentId: string, actorId: string) {
    const incident = await this.getOrThrow(incidentId);
    const updated = await this.prisma.securityIncident.update({
      where: { id: incidentId }, data: { status: 'NITDA_NOTIFIED', nitdaNotifiedAt: new Date() },
    });
    await this.breachQueue.removeRepeatableByKey(`breach-${incidentId}`).catch(() => undefined);
    const job = await this.breachQueue.getJob(`breach-${incidentId}`);
    await job?.remove().catch(() => undefined);

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'security_incidents', targetId: incidentId,
      oldValues: { status: incident.status }, newValues: { status: 'NITDA_NOTIFIED' },
    }, actorId);
    return updated;
  }

  async resolve(incidentId: string, actorId: string, dto: ResolveIncidentDto) {
    const incident = await this.getOrThrow(incidentId);
    const updated = await this.prisma.securityIncident.update({
      where: { id: incidentId },
      data: { status: 'RESOLVED', resolvedAt: new Date(), dpoNotes: dto.dpoNotes },
    });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'security_incidents', targetId: incidentId,
      oldValues: { status: incident.status }, newValues: { status: 'RESOLVED' },
    }, actorId);
    return updated;
  }

  async list() {
    const incidents = await this.prisma.securityIncident.findMany({
      orderBy: { detectedAt: 'desc' },
    });
    const now = Date.now();
    return incidents.map((i) => ({
      ...i,
      nitdaDeadline: new Date(i.detectedAt.getTime() + NITDA_DEADLINE_HOURS * 60 * 60 * 1000),
      overdue: i.status !== 'NITDA_NOTIFIED' && i.status !== 'RESOLVED'
        && (i.detectedAt.getTime() + NITDA_DEADLINE_HOURS * 60 * 60 * 1000) < now,
    }));
  }

  /** DPO is modelled as a STAFF ABAC scope (spec §6.2 pattern) — see PrivacyController's class doc for the same convention. */
  private async findDpoAndVcRecipients(): Promise<string[]> {
    const candidates = await this.prisma.user.findMany({
      where: { roles: { some: { OR: [{ roleName: 'VC' }, { roleName: 'STAFF' }, { roleName: 'SUPPORT_STAFF' }] } } },
      include: { roles: true },
    });
    return candidates
      .filter((u) => u.roles.some((r) =>
        r.roleName === 'VC'
        || ((r.roleName === 'STAFF' || r.roleName === 'SUPPORT_STAFF') && ((r.staffScope as { scopes?: string[] } | null)?.scopes ?? []).includes('dpo')),
      ))
      .map((u) => u.id);
  }

  private async getOrThrow(incidentId: string) {
    const incident = await this.prisma.securityIncident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'No such security incident' });
    return incident;
  }
}
