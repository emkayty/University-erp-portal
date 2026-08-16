import type { ConfigService } from '@nestjs/config';

export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  tls?: Record<string, never>;
}

/**
 * Resolve either a provider-supplied Redis connection URL or the explicit
 * variables used by local Docker Compose. A redis:// URL keeps TLS disabled;
 * rediss:// enables it. Explicit REDIS_TLS is used only without REDIS_URL.
 */
export function resolveRedisConnection(config: ConfigService): RedisConnectionOptions {
  const redisUrl = config.get<string>('REDIS_URL');
  if (redisUrl) {
    const endpoint = new URL(redisUrl);
    if (!['redis:', 'rediss:'].includes(endpoint.protocol)) {
      throw new Error('REDIS_URL must use redis:// or rediss://');
    }
    return {
      host: endpoint.hostname,
      port: Number(endpoint.port || 6379),
      password: endpoint.password ? decodeURIComponent(endpoint.password) : undefined,
      tls: endpoint.protocol === 'rediss:' ? {} : undefined,
    };
  }

  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    tls: config.get<boolean>('REDIS_TLS', false) ? {} : undefined,
  };
}
