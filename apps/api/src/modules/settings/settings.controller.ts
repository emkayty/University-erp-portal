import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { JwtPayload } from '@uniportal/types';

import { CurrentUser, Public, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdateFeatureFlagDto, UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller({ path: 'settings', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  @Public()
  @Get('public/branding')
  @ApiOperation({ summary: 'Public institution branding and contact information' })
  async getPublicBranding() {
    return { success: true, data: await this.svc.getPublicBranding() };
  }

  @Get()
  @Roles('SUPER_ADMIN', 'VC', 'REGISTRAR', 'BURSAR', 'HR_MANAGER')
  @ApiOperation({ summary: 'Get institution settings' })
  async get() {
    return { success: true, data: await this.svc.getSettings() };
  }

  @Patch()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '[SUPER_ADMIN] Update institution settings' })
  async update(@Body() dto: UpdateSettingsDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.updateSettings(dto, u.sub) };
  }

  @Get('feature-flags')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '[SUPER_ADMIN] List all feature flags' })
  async getFlags() {
    return { success: true, data: await this.svc.getFeatureFlags() };
  }

  @Patch('feature-flags/:key')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '[SUPER_ADMIN] Enable or disable a feature flag' })
  async setFlag(
    @Param('key') key: string,
    @Body() dto: UpdateFeatureFlagDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.setFeatureFlag(key, dto.enabled, u.sub) };
  }
}
