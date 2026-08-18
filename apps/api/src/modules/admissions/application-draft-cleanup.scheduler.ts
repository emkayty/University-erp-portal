import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ApplicationDraftCleanupScheduler {
  private readonly logger = new Logger(ApplicationDraftCleanupScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *', { timeZone: 'Africa/Lagos' })
  async removeExpiredDrafts(): Promise<void> {
    const result = await this.prisma.runSystem((tx) => tx.applicationDraft.deleteMany({ where: { expiresAt: { lt: new Date() } } }));
    if (result.count > 0) this.logger.log(`Removed ${result.count} expired admissions draft(s).`);
  }
}
