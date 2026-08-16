import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

const INCREMENT_SCRIPT = `
local blockedTtl = redis.call('PTTL', KEYS[2])
if blockedTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  local hitsTtl = redis.call('PTTL', KEYS[1])
  return { hits, hitsTtl, 1, blockedTtl }
end

local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local hitsTtl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('DEL', KEYS[1])
  return { hits, hitsTtl, 1, tonumber(ARGV[3]) }
end
return { hits, hitsTtl, 0, 0 }
`;

/**
 * Shared Redis throttler storage. The complete hit/block decision is one Lua
 * operation, so concurrent API replicas cannot independently accept the same
 * request before incrementing a shared counter.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${counterKey}:blocked`;
    try {
      const raw = await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        counterKey,
        blockKey,
        String(Math.max(1, Math.trunc(ttl))),
        String(Math.max(1, Math.trunc(limit))),
        String(Math.max(1, Math.trunc(blockDuration))),
      ) as [number | string, number | string, number | string, number | string];
      const [totalHits, hitsTtl, isBlocked, blockTtl] = raw;
      return {
        totalHits: Number(totalHits),
        timeToExpire: Math.max(0, Math.ceil(Number(hitsTtl) / 1000)),
        isBlocked: Number(isBlocked) === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(Number(blockTtl) / 1000)),
      };
    } catch (error) {
      this.logger.error(`Redis throttler unavailable for ${throttlerName}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

export { INCREMENT_SCRIPT };
