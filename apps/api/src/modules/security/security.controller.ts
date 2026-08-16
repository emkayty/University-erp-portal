import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';

import { CurrentUser, Roles, StaffScopes } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSecurityIncidentDto, ResolveIncidentDto } from './dto/security.dto';
import { SecurityIncidentsService } from './security-incidents.service';

/**
 * SecurityController — breach-notification workflow (spec §16.1). DPO/VC/super_admin only.
 * Deep-audit fix (Aug 2026): @UseGuards(RolesGuard) was missing entirely —
 * every endpoint here relied solely on @Roles()/@StaffScopes() decorators
 * with nothing enforcing them, so the full breach-notification workflow
 * (report, list all incidents including affectedUserIds, contain, confirm
 * NITDA notification, resolve) was reachable by any authenticated user.
 * See docs/CHANGELOG.md finding 1.2.
 */
@ApiTags('security')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('security')
export class SecurityController {
  constructor(private readonly incidents: SecurityIncidentsService) {}

  @ApiOperation({ summary: 'Report a security incident — triggers the T+72h NITDA workflow' })
  @Roles('SUPER_ADMIN')
  @Post('incidents')
  report(@Body() dto: CreateSecurityIncidentDto, @CurrentUser() user: JwtPayload) {
    return this.incidents.report(dto, user.sub);
  }

  @Roles('SUPER_ADMIN', 'STAFF')
  @StaffScopes('dpo')
  @Get('incidents')
  list() {
    return this.incidents.list();
  }

  @Roles('SUPER_ADMIN', 'STAFF')
  @StaffScopes('dpo')
  @Patch('incidents/:id/contain')
  contain(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.incidents.contain(id, user.sub);
  }

  @ApiOperation({ summary: 'Human DPO confirms the out-of-band NITDA filing is complete' })
  @Roles('SUPER_ADMIN', 'STAFF')
  @StaffScopes('dpo')
  @Patch('incidents/:id/nitda-notified')
  markNitdaNotified(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.incidents.markNitdaNotified(id, user.sub);
  }

  @Roles('SUPER_ADMIN', 'STAFF')
  @StaffScopes('dpo')
  @Patch('incidents/:id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveIncidentDto, @CurrentUser() user: JwtPayload) {
    return this.incidents.resolve(id, user.sub, dto);
  }
}
