import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Public, CurrentUser, FeatureFlag, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '@uniportal/types';
import { AlumniService } from './alumni.service';
import type {
  CreateCampaignDto, CreateDonationDto, GetAlumniQueryDto,
  UpdateAlumniProfileDto, UpdateCampaignStatusDto, UpdateDonationStatusDto,
} from './dto/alumni.dto';

@FeatureFlag('module_alumni')
@UseGuards(RolesGuard)
@Controller({ path: 'alumni', version: '1' })
export class AlumniController {
  constructor(private readonly alumni: AlumniService) {}

  // ── Alumni Profiles ───────────────────────────────────────────────────────
  @Roles('STAFF', 'SUPER_ADMIN')
  @Get()
  getAlumni(@Query() query: GetAlumniQueryDto) {
    return this.alumni.getAlumni(query);
  }

  @Get('me')
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.alumni.getMyAlumniProfile(user.sub);
  }

  @Get(':id')
  getAlumniById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.alumni.getAlumniById(id, user.sub, user.role);
  }

  @Patch(':id')
  updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlumniProfileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.alumni.updateProfile(id, dto, user.sub, user.role);
  }

  // ── Campaigns ─────────────────────────────────────────────────────────────
  /** Public — anyone can see active campaigns */
  @Public()
  @Get('campaigns/active')
  getActiveCampaigns() {
    return this.alumni.getCampaigns(false);
  }

  @Roles('VC', 'SUPER_ADMIN')
  @Get('campaigns/all')
  getAllCampaigns() {
    return this.alumni.getCampaigns(true);
  }

  @Roles('VC', 'SUPER_ADMIN')
  @Post('campaigns')
  createCampaign(@Body() dto: CreateCampaignDto, @CurrentUser() user: JwtPayload) {
    return this.alumni.createCampaign(dto, user.sub);
  }

  @Roles('VC', 'SUPER_ADMIN')
  @Patch('campaigns/:id/status')
  updateCampaignStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.alumni.updateCampaignStatus(id, dto, user.sub);
  }

  @Public()
  @Get('campaigns/:id')
  getCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.alumni.getCampaignById(id);
  }

  // ── Donations ─────────────────────────────────────────────────────────────
  @Post('donations')
  donate(@Body() dto: CreateDonationDto, @CurrentUser() user: JwtPayload) {
    return this.alumni.createDonation(dto, user.sub);
  }

  /** Webhook-style endpoint: called after payment gateway confirms payment */
  @Roles('SUPER_ADMIN', 'STAFF')
  @Patch('donations/:id/status')
  completeDonation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDonationStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.alumni.completeDonation(id, dto, user.sub);
  }

  @Roles('VC', 'SUPER_ADMIN')
  @Get('reports/donations')
  getDonationReport(@Query('campaignId') campaignId?: string) {
    return this.alumni.getDonationReport(campaignId);
  }
}
