import { RedisThrottlerStorage } from './redis-throttler.storage';

function makeRedis() {
  return { eval: jest.fn() } as any;
}

describe('RedisThrottlerStorage', () => {
  it('returns shared hit-window metadata from the atomic script', async () => {
    const redis = makeRedis();
    redis.eval.mockResolvedValue([3, 58_500, 0, 0]);
    const storage = new RedisThrottlerStorage(redis);

    await expect(storage.increment('route-key', 60_000, 5, 60_000, 'auth')).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 59,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call(\'INCR\''),
      2,
      'throttle:auth:route-key',
      'throttle:auth:route-key:blocked',
      '60000',
      '5',
      '60000',
    );
  });

  it('returns a blocked response when Redis reports an active block', async () => {
    const redis = makeRedis();
    redis.eval.mockResolvedValue(['6', '58000', '1', '30000']);
    const storage = new RedisThrottlerStorage(redis);

    await expect(storage.increment('route-key', 60_000, 5, 30_000, 'auth')).resolves.toMatchObject({
      totalHits: 6,
      isBlocked: true,
      timeToBlockExpire: 30,
    });
  });

  it('propagates Redis failures so the guard does not silently become process-local', async () => {
    const redis = makeRedis();
    redis.eval.mockRejectedValue(new Error('redis unavailable'));
    const storage = new RedisThrottlerStorage(redis);

    await expect(storage.increment('route-key', 60_000, 5, 60_000, 'auth')).rejects.toThrow('redis unavailable');
  });
});
