import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../../common/queue-names';
import { AcademicService } from '../academic.service';

interface AcademicProgressionRefreshJob {
  studentId: string;
  resultId: string;
  semesterId: string;
  actorId: string;
}

/**
 * Durable consumer for result-publication academic refresh requests.
 * AcademicService.runProgression() owns the transaction, advisory lock, policy
 * selection, idempotent evaluation, standing, and placement writes.
 */
@Processor(QUEUE_NAMES.ACADEMIC_PROGRESSION)
export class AcademicProgressionProcessor extends WorkerHost {
  private readonly logger = new Logger(AcademicProgressionProcessor.name);

  constructor(private readonly academic: AcademicService) { super(); }

  async process(job: Job<AcademicProgressionRefreshJob>): Promise<void> {
    if (job.name !== 'refresh-progression') {
      this.logger.warn(`Unknown academic progression job: ${job.name}`);
      return;
    }
    const { studentId, actorId } = job.data;
    if (!studentId || !actorId) throw new Error('Academic progression refresh requires studentId and actorId.');
    await this.academic.runProgression(studentId, actorId);
    this.logger.log(`Academic progression refreshed for student ${studentId} from result ${job.data.resultId}.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<AcademicProgressionRefreshJob>, error: Error): void {
    this.logger.error(`Academic progression job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`);
  }
}
