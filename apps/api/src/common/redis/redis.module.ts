import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { resolveRedisConnection } from './redis-connection';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * RedisModule provides a global ioredis client for:
 *  - Refresh token storage and rotation
 *  - Password reset OTPs
 *  - Rate limiting (via @nestjs/throttler)
 *  - Session management
 *
 * This is separate from the CacheModule (which uses cache-manager)
 * because we need direct Redis commands (SETEX, DEL, EXISTS)
 * for fine-grained token lifecycle management.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject:  [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const client = new Redis({
          ...resolveRedisConnection(config),
          maxRetriesPerRequest: 3,
          enableReadyCheck:  true,
          lazyConnect:       false,
          retryStrategy:     (times) => Math.min(times * 200, 3000),
          reconnectOnError:  (err) => {
            const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
            return targetErrors.some((e) => err.message.includes(e));
          },
        });

        client.on('connect',   () => { /* connected */ });
        client.on('error',     (err: Error) => console.error('[Redis]', err.message));
        client.on('reconnecting', () => { /* reconnecting */ });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
