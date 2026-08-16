import { Controller, Get, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../database/prisma.service';

@ApiTags('Reliability')
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN')
@Controller({ path: 'reliability', version: VERSION_NEUTRAL })
export class ReliabilityController {
  constructor(private readonly prisma: PrismaService) {}

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
}
