import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { PrismaService } from '../../database/prisma.service';
import { QUEUE_NAMES } from '../../common/queue-names';

interface DeliverDomainEventJob {
  eventType:    string;
  payload:      Record<string, unknown>;
  domainEventId: string;
}

/**
 * NotificationsProcessor — BullMQ worker for the NOTIFICATIONS queue.
 *
 * S5 DECISION: Custom notification service over Novu.
 *
 * EVALUATED: Novu (open-source notification infrastructure)
 * DECISION:  Custom BullMQ-based service with SMTP + Termii SMS
 *
 * RATIONALE:
 *   1. Data sovereignty — the Nigeria Data Protection Act 2023 (NDPA), as
 *      elaborated by the NDPC's General Application and Implementation
 *      Directive (GAID) 2025, requires personal data processing to occur
 *      within Nigeria or under adequate protection agreements. (Deep-audit
 *      fix, Aug 2026: this rationale previously cited "NDPR 2019 §2.1(b)"
 *      — that regulation was superseded by the NDPA + GAID framework
 *      effective 19 Sept 2025. The underlying reasoning is unchanged; only
 *      the citation needed updating.) Many Nigerian state university ICT
 *      policies explicitly forbid routing student PII through non-Nigerian
 *      cloud endpoints without a signed DPA. Novu's EU/US cloud would
 *      require institution-level DPA review per university.
 *
 *   2. Operational simplicity — Novu adds another external SaaS dependency.
 *      With BullMQ + Redis (already present) + Postal (self-hosted SMTP) or
 *      Mailgun NG endpoint, the entire notification stack stays within the
 *      institution's VPC on AWS ap-southeast-1 (Lagos region).
 *
 *   3. Flexibility — Termii SMS (Nigerian provider, NDPA-compliant) integrates
 *      natively. Novu's SMS abstraction adds latency for a marginal UX gain.
 *
 * FUTURE: If an institution explicitly accepts Novu's DPA and prefers managed
 * infrastructure, the worker.process() method can be replaced with a Novu
 * SDK call. The outbox → BullMQ job interface does not change.
 *
 * CHANNEL ROUTING:
 *   payment.completed         → EMAIL (payment receipt) + SMS confirmation
 *   result.senate_published   → EMAIL (result notification) + IN_APP
 *   student.registered        → EMAIL (welcome + credentials)
 *   applicant.rejected        → EMAIL (rejection letter)
 *   admission.status_updated  → EMAIL (offer / status change)
 *   calendar.activated/suspended/resumed/completed → EMAIL broadcast (capped 5000/event — see handleCalendarEvent)
 *   security.incident_reported/breach_reminder     → EMAIL to VC + DPO-scoped staff
 *   leave.decided             → EMAIL (approval/rejection)
 *   payroll.disbursed         → EMAIL (payslip notification)
 *
 * DELIVERY (deep-audit fix, Aug 2026): logNotification()/sendSms() previously
 * only ever logged a line and hardcoded status:'SENT' regardless of whether
 * anything actually sent — meaning no email or SMS was ever delivered in
 * this system's history, including the T+72h NITDA breach-alert path. Both
 * now perform a real send and record the ACTUAL outcome. Configuration is
 * read from SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM and
 * TERMII_API_KEY/TERMII_SENDER_ID. If those aren't set (e.g. local dev, or
 * an institution mid-setup), sends are skipped explicitly with status
 * 'SKIPPED_NOT_CONFIGURED' — never silently marked as if they succeeded.
 * On a real send failure, the job throws so BullMQ's existing retry/backoff
 * (5 attempts, exponential, configured in OutboxService) takes over; the
 * NotificationLog row still records the failed attempt either way.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS, { concurrency: 5 })
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private mailer: Transporter | null = null;
  private readonly mailFrom?: string;
  private readonly smtpConfigured: boolean;
  private readonly termiiConfigured: boolean;

  constructor(
    private readonly prisma:  PrismaService,
  ) {
    super();
    // SMTP_FROM falls back to the already-validated SES_FROM_ADDRESS (see
    // packages/config/src/env.schema.ts) so an institution that configured
    // AWS SES specifically — the provider this system's env schema and
    // .env.example were actually built around — doesn't need to set a
    // second, redundant "from" address. Plain SMTP transport (below) still
    // works against SES: SES exposes a standard SMTP interface alongside
    // its API, using separate SES-specific SMTP credentials (distinct from
    // IAM access keys) — set SMTP_HOST to your SES SMTP endpoint
    // (e.g. email-smtp.eu-west-1.amazonaws.com) and SMTP_USER/SMTP_PASS to
    // those SMTP credentials. Non-SES providers (Postal, Mailgun, a local
    // relay) work the same way with their own host/credentials.
    const fromAddress = process.env.SMTP_FROM ?? process.env.SES_FROM_ADDRESS;
    this.smtpConfigured = Boolean(process.env.SMTP_HOST && fromAddress);
    this.termiiConfigured = Boolean(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID);
    this.mailFrom = fromAddress;

    if (this.smtpConfigured) {
      this.mailer = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports (STARTTLS)
        auth:   process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    } else {
      this.logger.warn(
        'SMTP_HOST + (SMTP_FROM or SES_FROM_ADDRESS) not set — email delivery is disabled. ' +
        'Notifications will be logged and recorded as FAILED/not-configured, not sent.',
      );
    }
    if (!this.termiiConfigured) {
      this.logger.warn(
        'TERMII_API_KEY/TERMII_SENDER_ID not set — SMS delivery is disabled.',
      );
    }
  }

  // Job name: 'deliver-domain-event' (set by OutboxService.processOutbox())
  // S5: This processor is the custom alternative to Novu (see class doc).
  async process(job: Job<DeliverDomainEventJob>): Promise<void> {
    if (job.name !== 'deliver-domain-event') {
      this.logger.warn(`Unexpected job name: ${job.name} — skipping`);
      return;
    }
    const { eventType, payload, domainEventId } = job.data;
    this.logger.log(`Delivering notification: ${eventType} (domainEventId: ${domainEventId})`);

    switch (eventType) {
      case 'payment.completed':
        await this.handlePaymentCompleted(payload);
        break;
      case 'result.senate_published':
        await this.handleResultPublished(payload);
        break;
      case 'result.amended':
        await this.handleResultAmended(payload);
        break;
      case 'student.registered':
        await this.handleStudentRegistered(payload);
        break;
      case 'applicant.rejected':
        await this.handleApplicantRejected(payload);
        break;
      case 'admission.status_updated':
        await this.handleAdmissionStatusUpdated(payload);
        break;
      case 'admissions.application_submitted':
        await this.handleApplicationSubmitted(payload);
        break;
      case 'calendar.activated':
      case 'calendar.suspended':
      case 'calendar.resumed':
      case 'calendar.completed':
        await this.handleCalendarEvent(eventType, payload);
        break;
      case 'security.incident_reported':
      case 'security.breach_reminder':
        await this.handleSecurityIncidentAlert(eventType, payload);
        break;
      default:
        this.logger.debug(`No notification handler for event: ${eventType}`);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  private async handlePaymentCompleted(payload: Record<string, unknown>) {
    const { studentId, invoiceNo, amount, feeCleared } = payload;

    const student = await this.prisma.student.findUnique({
      where:  { id: studentId as string },
      select: { email: true, firstName: true, phone: true },
    });
    if (!student) return;

    await this.logNotification({
      recipientId:   studentId as string,
      recipientEmail: student.email,
      channel:        'EMAIL',
      templateKey:    'payment_receipt',
      subject:        `Payment Confirmed — ${invoiceNo}`,
      body:           this.renderTemplate('payment_receipt', {
        name: student.firstName, invoiceNo, amount, feeCleared,
      }),
    });

    // SMS: brief confirmation
    if (student.phone) {
      await this.sendSms(studentId as string, student.phone,
        `UniPortal: Payment of ₦${amount} received for invoice ${invoiceNo}. ` +
        (feeCleared ? 'Your fees are now CLEARED.' : 'Balance outstanding.'),
      );
    }
  }

  private async handleResultPublished(payload: Record<string, unknown>) {
    const { studentId, cgpa } = payload;
    const student = await this.prisma.student.findUnique({
      where:  { id: studentId as string },
      select: { email: true, firstName: true },
    });
    if (!student) return;

    await this.logNotification({
      recipientId:    studentId as string,
      recipientEmail: student.email,
      channel:        'EMAIL',
      templateKey:    'result_published',
      subject:        'Your Results Have Been Published',
      body:           this.renderTemplate('result_published', {
        name: student.firstName, cgpa,
      }),
    });
  }

  private async handleResultAmended(payload: Record<string, unknown>) {
    const { studentId, oldGrade, newGrade } = payload;
    const student = await this.prisma.student.findUnique({
      where:  { id: studentId as string },
      select: { email: true, firstName: true },
    });
    if (!student) return;

    await this.logNotification({
      recipientId:    studentId as string,
      recipientEmail: student.email,
      channel:        'EMAIL',
      templateKey:    'result_amended',
      subject:        'One of Your Results Has Been Amended',
      body:           this.renderTemplate('result_amended', { name: student.firstName, oldGrade, newGrade }),
    });
  }

  private async handleStudentRegistered(payload: Record<string, unknown>) {
    const { studentId, matricNo } = payload;
    const student = await this.prisma.student.findUnique({
      where:  { id: studentId as string },
      select: { email: true, firstName: true },
    });
    if (!student) return;

    await this.logNotification({
      recipientId:    studentId as string,
      recipientEmail: student.email,
      channel:        'EMAIL',
      templateKey:    'welcome_student',
      subject:        `Welcome to UniPortal — Matric No: ${matricNo}`,
      body:           this.renderTemplate('welcome_student', {
        name: student.firstName, matricNo,
      }),
    });
  }

  private async handleApplicantRejected(payload: Record<string, unknown>) {
    const { email, reason } = payload;
    await this.logNotification({
      recipientId:    null,
      recipientEmail: email as string,
      channel:        'EMAIL',
      templateKey:    'admission_rejected',
      subject:        'Your Application Status Update',
      body:           this.renderTemplate('admission_rejected', { reason }),
    });
  }

  private async handleApplicationSubmitted(payload: Record<string, unknown>) {
    const { email, firstName, applicationNo, paymentStatus } = payload;
    await this.logNotification({
      recipientId: null,
      recipientEmail: email as string,
      channel: 'EMAIL',
      templateKey: 'admission_application_submitted',
      subject: 'UniPortal Admission Application Received',
      body: this.renderTemplate('admission_application_submitted', { name: firstName, applicationNo, paymentStatus }),
    });
  }

  private async handleAdmissionStatusUpdated(payload: Record<string, unknown>) {
    const { email, firstName, status } = payload;
    const templateKey = status === 'OFFERED' ? 'admission_offer' : 'admission_status_update';
    await this.logNotification({
      recipientId:    null,
      recipientEmail: email as string,
      channel:        'EMAIL',
      templateKey,
      subject:        status === 'OFFERED' ? 'You Have Been Offered Admission' : 'Your Application Status Has Changed',
      body:           this.renderTemplate(templateKey, { name: firstName, status }),
    });
  }

  /** ASUU-suspension notices (and the resume/activate/complete counterparts)
   *  go to every currently-enrolled active student + staff member — this is
   *  an institution-wide broadcast, not a single-recipient notification like
   *  the other handlers, so it fans out via one real email per recipient
   *  (capped at 5000; see below), with per-recipient failure isolation. */
  private async handleCalendarEvent(eventType: string, payload: Record<string, unknown>) {
    const templateKey = `calendar_${eventType.split('.')[1]}`; // calendar.suspended -> calendar_suspended
    const recipients = await this.prisma.user.findMany({
      where: { isActive: true, OR: [{ student: { status: 'ACTIVE' } }, { staff: { employmentStatus: 'ACTIVE' } }] },
      select: { id: true, email: true },
      take: 5000, // safety cap — a true "every user" broadcast belongs in a dedicated bulk job (see result-notifications queue), not this general-purpose one
    });

    this.logger.log(`Calendar event ${eventType}: broadcasting to ${recipients.length} recipient(s) (capped at 5000)`);

    // Deep-audit fix (Aug 2026): logNotification() now throws on a genuine
    // send failure so single-recipient callers get a real BullMQ retry —
    // but that would be wrong here: one bounced address out of up to 5000
    // must not abort the whole loop and trigger a full-job retry (which
    // would re-send to every recipient who already succeeded, potentially
    // several times over the configured 5 retry attempts). Each send is
    // isolated so one failure doesn't affect the rest of the broadcast;
    // failures are tallied and logged once at the end instead.
    let failureCount = 0;
    for (const recipient of recipients) {
      try {
        await this.logNotification({
          recipientId:    recipient.id,
          recipientEmail: recipient.email,
          channel:        'EMAIL',
          templateKey,
          subject:        this.calendarEventSubject(eventType),
          body:           this.renderTemplate(templateKey, payload),
        });
      } catch {
        failureCount += 1; // already logged (as FAILED, with reason) inside logNotification()
      }
    }
    if (failureCount > 0) {
      this.logger.warn(
        `Calendar event ${eventType}: ${failureCount}/${recipients.length} broadcast email(s) failed — see notification_logs for detail per recipient`,
      );
    }
  }

  private calendarEventSubject(eventType: string): string {
    switch (eventType) {
      case 'calendar.suspended': return 'Academic Calendar Suspended';
      case 'calendar.resumed':   return 'Academic Calendar Resumed';
      case 'calendar.activated': return 'New Academic Calendar Activated';
      case 'calendar.completed': return 'Academic Year Completed';
      default: return 'Academic Calendar Update';
    }
  }

  private async handleSecurityIncidentAlert(eventType: string, payload: Record<string, unknown>) {
    const { recipientIds, incidentId, type, urgent } = payload as {
      recipientIds: string[]; incidentId: string; type: string; urgent?: boolean;
    };
    if (!recipientIds || recipientIds.length === 0) {
      this.logger.error(`${eventType}: no recipientIds in payload for incident ${incidentId} — cannot alert anyone`);
      return;
    }

    const recipients = await this.prisma.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, email: true },
    });

    const subject = eventType === 'security.breach_reminder'
      ? `${urgent ? 'URGENT: ' : ''}NITDA Notification Deadline Approaching — Incident ${incidentId}`
      : `Security Incident Reported — ${type}`;

    // Same per-recipient failure isolation as handleCalendarEvent() above:
    // this alert is the most time-critical one in the system (T+72h NITDA
    // deadline) — one unreachable DPO/VC address must not prevent the
    // others in recipientIds from being alerted, nor trigger a full-job
    // retry that re-sends to everyone who already got it.
    let failureCount = 0;
    for (const recipient of recipients) {
      try {
        await this.logNotification({
          recipientId:    recipient.id,
          recipientEmail: recipient.email,
          channel:        'EMAIL',
          templateKey:    eventType === 'security.breach_reminder' ? 'breach_alert_dpo_urgent' : 'breach_alert_dpo',
          subject,
          body: this.renderTemplate(eventType === 'security.breach_reminder' ? 'breach_alert_dpo_urgent' : 'breach_alert_dpo', payload),
        });
      } catch {
        failureCount += 1;
      }
    }
    if (failureCount > 0) {
      this.logger.error(
        `${eventType} for incident ${incidentId}: ${failureCount}/${recipients.length} alert(s) FAILED to send — ` +
        `verify at least one DPO/VC was actually reached, given the T+72h deadline`,
      );
    }
  }

  // ── Infrastructure ─────────────────────────────────────────────────────────
  private async logNotification(data: {
    recipientId:    string | null;
    recipientEmail: string;
    channel:        string;
    templateKey:    string;
    subject:        string;
    body:           string;
  }) {
    if (!data.recipientId) {
      // NotificationLog.recipientId is a required FK to User. Applicant
      // records are not User rows, so this is an integration/schema boundary,
      // not a reason to pretend delivery succeeded. Throwing keeps the
      // domain event retryable and ultimately visible in the outbox DLQ for
      // operator action until an external-recipient delivery log exists.
      const message = `Cannot deliver "${data.templateKey}" to ${data.recipientEmail}: no User recipientId resolved`;
      this.logger.error(message);
      throw new Error(`NOTIFICATION_RECIPIENT_UNRESOLVED: ${message}`);
    }

    if (!this.smtpConfigured || !this.mailer) {
      this.logger.warn(
        `[EMAIL SKIPPED — SMTP not configured] To: ${data.recipientEmail} | Subject: ${data.subject}`,
      );
      await this.prisma.notificationLog.create({
        data: {
          recipientId: data.recipientId, channel: 'EMAIL',
          templateKey: data.templateKey, subject: data.subject, body: data.body,
          status: 'FAILED',
          failureReason: 'SMTP not configured (SMTP_HOST/SMTP_FROM unset) — no email was sent',
        },
      });
      return;
    }

    try {
      const info = await this.mailer.sendMail({
        from:    this.mailFrom,
        to:      data.recipientEmail,
        subject: data.subject,
        text:    data.body,
      });
      this.logger.log(`[EMAIL SENT] To: ${data.recipientEmail} | Subject: ${data.subject} | messageId: ${info.messageId}`);
      await this.prisma.notificationLog.create({
        data: {
          recipientId: data.recipientId, channel: 'EMAIL',
          templateKey: data.templateKey, subject: data.subject, body: data.body,
          status: 'SENT', sentAt: new Date(),
          metadata: { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[EMAIL FAILED] To: ${data.recipientEmail} | Subject: ${data.subject} | ${message}`);
      await this.prisma.notificationLog.create({
        data: {
          recipientId: data.recipientId, channel: 'EMAIL',
          templateKey: data.templateKey, subject: data.subject, body: data.body,
          status: 'FAILED', failureReason: message.slice(0, 2000),
        },
      });
      // Rethrow so BullMQ's configured retry/backoff (OutboxService: 5
      // attempts, exponential) actually retries a transient SMTP failure,
      // rather than the job silently being marked complete despite failing.
      throw err;
    }
  }

  private async sendSms(recipientId: string, phone: string, message: string) {
    if (!this.termiiConfigured) {
      this.logger.warn(`[SMS SKIPPED — Termii not configured] To: ${phone} | "${message.slice(0, 60)}..."`);
      await this.prisma.notificationLog.create({
        data: {
          recipientId, channel: 'SMS', templateKey: 'sms_generic',
          subject: 'SMS', body: message,
          status: 'FAILED',
          failureReason: 'Termii not configured (TERMII_API_KEY/TERMII_SENDER_ID unset) — no SMS was sent',
        },
      });
      return;
    }

    try {
      // https://developer.termii.com/send-message
      const res = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TERMII_API_KEY,
          to:      phone,
          from:    process.env.TERMII_SENDER_ID,
          sms:     message,
          type:    'plain',
          channel: 'generic',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`Termii responded ${res.status}: ${JSON.stringify(body).slice(0, 500)}`);
      }
      this.logger.log(`[SMS SENT] To: ${phone} | messageId: ${(body as { message_id?: string }).message_id ?? 'unknown'}`);
      await this.prisma.notificationLog.create({
        data: {
          recipientId, channel: 'SMS', templateKey: 'sms_generic',
          subject: 'SMS', body: message,
          status: 'SENT', sentAt: new Date(), metadata: body as object,
        },
      });
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[SMS FAILED] To: ${phone} | ${errMessage}`);
      await this.prisma.notificationLog.create({
        data: {
          recipientId, channel: 'SMS', templateKey: 'sms_generic',
          subject: 'SMS', body: message,
          status: 'FAILED', failureReason: errMessage.slice(0, 2000),
        },
      });
      throw err; // same retry rationale as logNotification()
    }
  }

  private renderTemplate(key: string, vars: Record<string, unknown>): string {
    // Minimal template rendering — replace {{ variable }} placeholders
    const templates: Record<string, string> = {
      payment_receipt: `Dear {{name}}, your payment of ₦{{amount}} for invoice {{invoiceNo}} has been confirmed. Fee cleared: {{feeCleared}}.`,
      result_published: `Dear {{name}}, your results have been published on UniPortal. Current CGPA: {{cgpa}}.`,
      result_amended: `Dear {{name}}, a previously published result has been amended. Grade changed from {{oldGrade}} to {{newGrade}}. Contact your department if you have questions.`,
      welcome_student: `Dear {{name}}, welcome to the university. Your matric number is {{matricNo}}. Log in at portal.university.edu.ng.`,
      admission_rejected: `Your admission application has been reviewed. Status: REJECTED. Reason: {{reason}}. You may re-apply next session.`,
      admission_offer: `Dear {{name}}, congratulations — you have been offered admission. Log in to accept your offer.`,
      admission_status_update: `Dear {{name}}, your application status has changed to {{status}}.`,
      admission_application_submitted: `Dear {{name}}, your UniPortal admission application {{applicationNo}} has been received. Keep the application number and private tracking credential safe. Current payment status: {{paymentStatus}}.`,
      calendar_activated: `A new academic calendar has been activated.`,
      calendar_suspended: `Academic operations have been suspended. Reason: {{reason}}. You will be notified when normal operations resume.`,
      calendar_resumed: `Academic operations have resumed as of {{resumedAt}}. Registration, results, and timetable access are restored.`,
      calendar_completed: `The academic year has been marked complete.`,
      breach_alert_dpo: `A security incident ({{type}}) was reported (incident {{incidentId}}). NITDA notification deadline: {{deadline}}. Review and act within the required window.`,
      breach_alert_dpo_urgent: `URGENT — incident {{incidentId}} ({{type}}) has {{hoursRemaining}}h remaining before the T+72h NITDA deadline. If notification hasn't been filed, act now.`,
    };
    let tpl = templates[key] ?? `Notification: ${key}`;
    for (const [k, v] of Object.entries(vars)) {
      tpl = tpl.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
    }
    return tpl;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Notification job ${job.id} (${job.name}) failed after ${job.attemptsMade} attempts: ${err.message}`,
    );
  }
}
