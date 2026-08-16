import { Controller, Get, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import {
  HealthCheck, HealthCheckService, HttpHealthIndicator,
  MemoryHealthIndicator, DiskHealthIndicator,
  PrismaHealthIndicator, HealthIndicator,
  HealthIndicatorResult, HealthCheckError,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { PrismaService } from '../database/prisma.service';
import { Public, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';

// H5 FIX: Custom Redis health indicator
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) { super(); }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const start = Date.now();
      const pong  = await Promise.race([
        this.redis.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 1000)
        ),
      ]);
      const latencyMs = Date.now() - start;
      if (pong === 'PONG') {
        return this.getStatus(key, true, { latencyMs });
      }
      throw new Error('Unexpected Redis response');
    } catch (err) {
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, { error: (err as Error).message }),
      );
    }
  }
}

@ApiTags('Health')
@UseGuards(RolesGuard)
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health:    HealthCheckService,
    private readonly prismaInd: PrismaHealthIndicator,
    private readonly memory:    MemoryHealthIndicator,
    private readonly disk:      DiskHealthIndicator,
    private readonly redisInd:  RedisHealthIndicator,
    private readonly prisma:    PrismaService,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN')
  @HealthCheck()
  @ApiOperation({ summary: 'Full system health check (DB + Redis + memory + disk)' })
  check() {
    return this.health.check([
      () => this.prismaInd.pingCheck('database', this.prisma),
      () => this.redisInd.isHealthy('redis'),          // H5 FIX: Redis now checked
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss',   1024 * 1024 * 1024),
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.90 }),
    ]);
  }

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness probe' })
  live() { return { status: 'ok', timestamp: new Date().toISOString() }; }

  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe (DB + Redis must be reachable)' })
  ready() {
    return this.health.check([
      () => this.prismaInd.pingCheck('database', this.prisma),
      () => this.redisInd.isHealthy('redis'),
    ]);
  }

  @Get('integrations')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Provider configuration readiness without exposing secrets' })
  integrations() {
    const present = (...keys: string[]) => keys.every((key) => Boolean(process.env[key]?.trim()));
    const remitaVerificationEnabled = process.env.REMITA_STATUS_VERIFICATION_ENABLED === 'true';
    return {
      paystack: {
        configured: present('PAYSTACK_SECRET_KEY', 'PAYSTACK_WEBHOOK_SECRET'),
        webhookVerification: present('PAYSTACK_WEBHOOK_SECRET'),
        note: 'Provider certification and live-mode verification remain deployment gates.',
      },
      remita: {
        configured: present('REMITA_MERCHANT_ID', 'REMITA_API_KEY', 'REMITA_WEBHOOK_SECRET', 'REMITA_SERVICE_TYPE_ID'),
        statusVerification: remitaVerificationEnabled && present('REMITA_STATUS_ENDPOINT'),
        note: remitaVerificationEnabled ? 'Server-to-server status verification is enabled.' : 'Status verification is disabled; do not treat callback receipt as settlement.',
      },
        admissions: {
          jamb: { configured: present('JAMB_API_BASE_URL', 'JAMB_API_KEY'), mode: present('JAMB_API_BASE_URL', 'JAMB_API_KEY') ? 'provider-configured' : 'manual-verification' },
          waec: { configured: present('WAEC_API_BASE_URL', 'WAEC_API_KEY'), mode: present('WAEC_API_BASE_URL', 'WAEC_API_KEY') ? 'provider-configured' : 'manual-verification' },
        },
        lmsStorage: {
          configured: present('S3_UPLOADS_BUCKET'),
          mode: present('S3_UPLOADS_BUCKET') ? 'private-s3' : 'not-configured',
        },
    };
  }
}
