import {
  Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe,
  Post, Query, UseGuards, VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../database/prisma.service';
import type { JwtPayload } from '@uniportal/types';
import { ReliabilityService } from './reliability.service';

@ApiTags('Reliability')
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN')
@Controller({ path: 'reliability', version: VERSION_NEUTRAL })
export class ReliabilityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reliability: ReliabilityService,
  ) {}

  @Get('version')
  @ApiOperation({ summary: 'Non-sensitive application build/version information' })
  version() {
    return {
      service: 'uniportal-api',
      environment: process.env.NODE_ENV ?? 'development',
      build: process.env.APP_BUILD_ID ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('db')
  @ApiOperation({ summary: 'Database dependency probe' })
  async database() {
    const healthy = await this.prisma.isHealthy();
    return { status: healthy ? 'ok' : 'degraded' };
  }

  @Get('queues')
  @ApiOperation({ summary: 'Show BullMQ queue depth and failed-job counts' })
  queueHealth() {
    return this.reliability.queueHealth();
  }

  @Get('dead-letters')
  @ApiOperation({ summary: 'List transactional outbox dead-letter events' })
  async deadLetters(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return { events: await this.reliability.listDeadLetters(limit) };
  }

  @Post('dead-letters/:id/replay')
  @ApiOperation({ summary: 'Requeue one dead-letter event for worker dispatch' })
  async replayDeadLetter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reliability.replayDeadLetter(id, user.sub);
  }
}
