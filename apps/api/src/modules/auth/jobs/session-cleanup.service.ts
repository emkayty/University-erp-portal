import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';

import { PrismaService } from '../../../database/prisma.service';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

/**
 * SessionCleanupService — removes expired sessions from the DB.
 *
 * Redis TTLs handle refresh token expiry automatically.
 * This job cleans up the `sessions` Postgres table for session-management UI
 * (the "active sessions" list shown to users).
 *
 * Runs every 2 hours — light read + delete on an indexed datetime column.
 */
@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Cron('0 */2 * * *', { timeZone: 'Africa/Lagos' })
  async cleanExpiredSessions(): Promise<void> {
    try {
      const result = await this.prisma.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { revokedAt: { not: null, lt: new Date(Date.now() - 86400_000) } }, // revoked > 24h ago
          ],
        },
      });
      if (result.count > 0) {
        this.logger.log(`Session cleanup: removed ${result.count} expired/revoked sessions`);
      }
    } catch (err) {
      this.logger.error(`Session cleanup failed: ${String(err)}`);
    }
  }
}
