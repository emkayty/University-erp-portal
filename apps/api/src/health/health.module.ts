import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController, RedisHealthIndicator } from './health.controller';

@Module({
  imports: [TerminusModule.forRoot({ gracefulShutdownTimeoutMs: 5000 })],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
