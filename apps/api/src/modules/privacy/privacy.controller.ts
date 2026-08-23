import {
  Body, Controller, Delete, ForbiddenException, Get, Param, Post, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { JwtPayload, StaffScopeAttribute } from '@uniportal/types';

import { Authenticated, CurrentUser, Roles, StaffScopes } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ErasureRequestDto, PersonDsrIntakeDto, RectifyUserDto, RestrictProcessingDto } from './dto/privacy.dto';
import { PrivacyService } from './privacy.service';

/**
 * PrivacyController — Data Subject Rights under the Nigeria Data Protection
 * Act 2023 (NDPA), as elaborated by the NDPC's General Application and
 * Implementation Directive (GAID) 2025. (Deep-audit fix, Aug 2026: this
 * previously cited "NDPR 2019" — that regulation was superseded by the NDPA
 * + GAID framework, effective 19 Sept 2025; see
 * docs/CHANGELOG.md finding 1.4 for the full account. The
 * substantive rights below — access, rectification, erasure, portability,
 * restriction — are unchanged by the transition.)
 *
 * "DPO" is not a distinct entry in the 10-role RBAC enum (spec §6.1) — it is
 * modelled here as a STAFF ABAC scope, `staffScope.scopes: ["dpo"]`,
 * consistent with how every other specialised staff function in this system
 * (finance_clerk, hr_clerk, lecturer, ...) is modelled (spec §6.2). Grant it
 * via PATCH /api/v1/users/:id/roles like any other staffScope.
 *
 * Deep-audit fix (Aug 2026): @UseGuards(RolesGuard) was missing from this
 * controller entirely. sar/rectify/export were still safe (each has its own
 * inline assertSelfOrDpo()/self check below, independent of the guard), but
 * erase() and restrictProcessing() had ONLY their @Roles()/@StaffScopes()
 * decorators standing between them and any authenticated user — with no
 * guard reading those decorators, both were open to anyone logged in. See
 * docs/CHANGELOG.md finding 1.2.
 */
@ApiTags('privacy')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller({ path: 'privacy', version: '1' })
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @ApiOperation({ summary: 'Right of Access (SAR) — subject or DPO only' })
  @Authenticated()
  @Get('sar/:userId')
  requestAccess(@Param('userId') userId: string, @CurrentUser() user: JwtPayload) {
    this.assertSelfOrDpo(userId, user);
    return this.privacy.requestAccess(userId, user.sub);
  }

  @ApiOperation({ summary: 'Canonical Person DSR intake — DPO or SUPER_ADMIN; identity verification required' })
  @Roles('STAFF', 'SUPPORT_STAFF', 'SUPER_ADMIN')
  @StaffScopes('dpo')
  @Post('person/:personId/intake')
  intakePersonRequest(
    @Param('personId') personId: string,
    @Body() dto: PersonDsrIntakeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.privacy.intakePersonRequest(personId, user.sub, dto);
  }

  @ApiOperation({ summary: 'Right to Rectification — subject only' })
  @Authenticated()
  @Post('rectify/:userId')
  rectify(
    @Param('userId') userId: string,
    @Body() dto: RectifyUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.sub !== userId && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'You may only rectify your own data' });
    }
    return this.privacy.rectify(userId, user.sub, dto);
  }

  @ApiOperation({ summary: 'Right to Erasure — super_admin only, VC sign-off reference required' })
  @Roles('SUPER_ADMIN')
  @Delete('erase/:userId')
  erase(
    @Param('userId') userId: string,
    @Body() dto: ErasureRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.privacy.erase(userId, user.sub, dto);
  }

  @ApiOperation({ summary: 'Right to Data Portability — subject or DPO only' })
  @Authenticated()
  @Get('export/:userId')
  exportData(@Param('userId') userId: string, @CurrentUser() user: JwtPayload) {
    this.assertSelfOrDpo(userId, user);
    return this.privacy.exportData(userId, user.sub);
  }

  @ApiOperation({ summary: 'Right to Restriction of Processing — DPO only' })
  @Roles('STAFF','SUPER_ADMIN')
  @StaffScopes('dpo')
  @Post('restrict/:userId')
  restrictProcessing(
    @Param('userId') userId: string,
    @Body() dto: RestrictProcessingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.privacy.restrictProcessing(userId, user.sub, dto);
  }

  private assertSelfOrDpo(userId: string, user: JwtPayload): void {
    if (user.sub === userId || user.role === 'SUPER_ADMIN') return;
    const isDpo = (user.role === 'STAFF' || user.role === 'SUPPORT_STAFF')
      && ((user.staffScope as StaffScopeAttribute | null)?.scopes ?? []).includes('dpo' as never);
    if (!isDpo) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'You may only access your own data' });
    }
  }
}
