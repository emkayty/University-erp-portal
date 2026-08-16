import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../../common/queue-names';
import { AdmissionsService } from '../admissions.service';

interface VerifyJambJob  { applicantId: string; jambRegNo: string; }
interface VerifyOLevelJob { applicantId: string; waecRegNo: string; examYear: number; }

/**
 * AdmissionsOpsProcessor — BullMQ worker for async external API verifications.
 *
 * JAMB API: Verifies UTME scores via JAMB portal API (requires MOU).
 *           Falls back gracefully when API is unavailable — job fails and
 *           DLQ captures it for manual review by admissions officer.
 *
 * WAEC API: Verifies O'level results (West African Examinations Council).
 *
 * When APIs are unavailable (common in Nigerian context), admissions officers
 * use the manual override via PATCH /admissions/applications/:id/verify-jamb-manual.
 */
@Processor(QUEUE_NAMES.ADMISSIONS_OPS)
export class AdmissionsOpsProcessor extends WorkerHost {
  private readonly logger = new Logger(AdmissionsOpsProcessor.name);

  constructor(private readonly admissions: AdmissionsService) { super(); }

  async process(job: Job<VerifyJambJob | VerifyOLevelJob>): Promise<void> {
    this.logger.log(`Processing job ${job.id} (${job.name})`);

    switch (job.name) {
      case 'verify-jamb':
        return this.handleJambVerification(job as Job<VerifyJambJob>);
      case 'verify-olevel':
        return this.handleOLevelVerification(job as Job<VerifyOLevelJob>);
      case 'manual-verification-required':
        this.logger.warn(`Manual verification work item recorded for ${String((job.data as any).applicantId)} (${String((job.data as any).verificationType)})`);
        return;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleJambVerification(job: Job<VerifyJambJob>): Promise<void> {
    const { applicantId, jambRegNo } = job.data;
    this.logger.log(`Verifying JAMB for applicant ${applicantId}, regNo: ${jambRegNo}`);

    try {
      // TODO P4+: Replace with actual JAMB API call when MOU is signed.
      // const result = await this.jambApiService.verify(jambRegNo);
      // For now, mark as pending manual verification if API unavailable.
      // await this.admissionsService.updateJambVerification(applicantId, result.verified, result.score);

      const result = await this.admissions.markManualVerificationRequired(
        applicantId,
        'JAMB',
        `JAMB API integration pending MOU; registration ${jambRegNo} requires manual verification via the admissions UI.`,
      );
      this.logger.warn(`JAMB manual verification required for ${applicantId}; durable event ${result.eventId} recorded.`);
    } catch (err) {
      this.logger.error(`JAMB verification failed for ${applicantId}: ${String(err)}`);
      throw err; // BullMQ will retry per job options
    }
  }

  private async handleOLevelVerification(job: Job<VerifyOLevelJob>): Promise<void> {
    const { applicantId } = job.data;
    this.logger.log(`O'level verification pending for applicant ${applicantId}`);
    const result = await this.admissions.markManualVerificationRequired(
      applicantId,
      'OLEVEL',
      `WAEC/O'Level provider integration pending; ${job.data.examYear} evidence requires manual verification via the admissions UI.`,
    );
    this.logger.warn(`O'Level manual verification required for ${applicantId}; durable event ${result.eventId} recorded.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Job ${job.id} (${job.name}) failed after ${job.attemptsMade} attempts: ${err.message}`,
    );
  }
}
