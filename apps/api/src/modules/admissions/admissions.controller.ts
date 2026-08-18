import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Param, ParseIntPipe, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApplicantStatus, AdmissionType, VerificationStatus } from '@prisma/client';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Public, Roles, StaffScopes, IdempotencyKey } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdmissionsService } from './admissions.service';
import {
  CreateAdmissionCycleDto, CreateApplicantDto,
  MatriculateApplicantDto, RecordOLevelResultsDto, VerifyOLevelResultsDto, VerifyJambDto,
  ScreenApplicantsDto, UpdateApplicantStatusDto, UpdateAccessibilitySupportDto, TrackApplicationDto, ApplicationChangeRequestDto, UpdateApplicationChangeRequestDto, SaveApplicationDraftDto, LoadApplicationDraftDto, CreateAdmissionRequirementDto, VerifyApplicationDocumentDto, RegisterApplicationDocumentDto, ApplicantPhotoPresignDto, ApplicantPhotoCompleteDto, ApplicantPhotoPreSubmitPresignDto, ApplicantPhotoPreSubmitCompleteDto,
} from './dto/admissions.dto';

@ApiTags('Admissions')
@Controller({ path: 'admissions', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class AdmissionsController {
  constructor(private readonly svc: AdmissionsService) {}

  // ── Cycles ─────────────────────────────────────────────────────────────────
  @Post('cycles')
  @Roles('REGISTRAR', 'SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Create admission cycle' })
  async createCycle(@Body() dto: CreateAdmissionCycleDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createCycle(dto, u.sub) };
  }

  @Get('cycles')
  @Roles('SUPER_ADMIN','REGISTRAR','STAFF')
  @ApiQuery({ name: 'academicYear', required: false })
  async getCycles(@Query('academicYear') academicYear?: string) {
    return { success: true, data: await this.svc.findAllCycles(academicYear) };
  }

  @Patch('cycles/:id/activate')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Activate an admission cycle' })
  async activateCycle(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.activateCycle(id, u.sub) };
  }

  @Get('public/reference/countries')
  @Public()
  @ApiOperation({ summary: 'Public country reference list' })
  async publicCountries() { return { success: true, data: await this.svc.listReferenceCountries() }; }

  @Get('public/reference/divisions')
  @Public()
  @ApiOperation({ summary: 'Public country/state/province/LGA reference list' })
  @ApiQuery({ name: 'countryId', required: true })
  @ApiQuery({ name: 'parentId', required: false })
  async publicDivisions(@Query('countryId') countryId: string, @Query('parentId') parentId?: string) { return { success: true, data: await this.svc.listReferenceDivisions(countryId, parentId) }; }

  @Get('public/reference/examination-authorities')
  @Public()
  async publicExamAuthorities() { return { success: true, data: await this.svc.listReferenceExamAuthorities() }; }

  @Get('public/reference/examination-types')
  @Public()
  @ApiQuery({ name: 'authorityId', required: true })
  async publicExamTypes(@Query('authorityId') authorityId: string) { return { success: true, data: await this.svc.listReferenceExamTypes(authorityId) }; }

  @Get('public/reference/subjects')
  @Public()
  async publicSubjects() { return { success: true, data: await this.svc.listReferenceSubjects() }; }

  @Get('public/cycles')
  @Public()
  @ApiOperation({ summary: 'Public list of currently open admission cycles' })
  async publicCycles() { return { success: true, data: await this.svc.findPublicCycles() }; }

  @Get('public/programmes')
  @Public()
  @ApiOperation({ summary: 'Public list of active programmes for application' })
  async publicProgrammes() { return { success: true, data: await this.svc.findPublicProgrammes() }; }

  @Get('public/requirements')
  @Public()
  @ApiQuery({ name: 'programmeId', required: true })
  @ApiQuery({ name: 'admissionType', required: false, enum: AdmissionType })
  @ApiQuery({ name: 'academicYear', required: false })
  async publicRequirement(@Query('programmeId', ParseUUIDPipe) programmeId: string, @Query('admissionType') admissionType?: AdmissionType, @Query('academicYear') academicYear?: string) {
    return { success: true, data: await this.svc.findPublicRequirement(programmeId, admissionType, academicYear) };
  }

  @Post('requirements')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Configure programme-specific admission requirements' })
  async createRequirement(@Body() dto: CreateAdmissionRequirementDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.createAdmissionRequirement(dto, u.sub) }; }

  @Get('requirements')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiQuery({ name: 'programmeId', required: false })
  @ApiQuery({ name: 'academicYear', required: false })
  async listRequirements(@Query('programmeId') programmeId?: string, @Query('academicYear') academicYear?: string) { return { success: true, data: await this.svc.listAdmissionRequirements(programmeId, academicYear) }; }

  // ── Applications ───────────────────────────────────────────────────────────
  @Post('public/change-request')
  @Public()
  @Throttle({ api: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a tracking-authenticated correction or withdrawal request' })
  async createChangeRequest(@Body() dto: ApplicationChangeRequestDto) {
    return { success: true, data: await this.svc.createApplicationChangeRequest(dto) };
  }

  @Post('public/draft/save')
  @Public()
  @Throttle({ api: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save an encrypted, expiring admissions draft' })
  async saveDraft(@Body() dto: SaveApplicationDraftDto) {
    return { success: true, data: await this.svc.saveApplicationDraft(dto) };
  }

  @Post('public/draft/load')
  @Public()
  @Throttle({ api: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume an admissions draft using its private credential' })
  async loadDraft(@Body() dto: LoadApplicationDraftDto) {
    return { success: true, data: await this.svc.loadApplicationDraft(dto) };
  }

  @Post('public/track')
  @Public()
  @Throttle({ api: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Public application status lookup' })
  async track(@Body() dto: TrackApplicationDto) { return { success: true, data: await this.svc.trackPublicApplication(dto) }; }

  @Post('apply')
  @Public()
  @Throttle({ api: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit new application (public endpoint)' })
  async apply(@Body() dto: CreateApplicantDto, @IdempotencyKey() idempotencyKey?: string) {
    return { success: true, data: await this.svc.apply(dto, idempotencyKey) };
  }

  @Post('public/photo/pre-submit/presign')
  @Public()
  @Throttle({ api: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pre-submit passport-photo upload presign' })
  async presignApplicantPhotoPreSubmit(@Body() dto: ApplicantPhotoPreSubmitPresignDto) {
    return { success: true, data: await this.svc.presignApplicantPhotoPreSubmit(dto) };
  }

  @Post('public/photo/pre-submit/complete')
  @Public()
  @Throttle({ api: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete and verify pre-submit passport-photo upload' })
  async completeApplicantPhotoPreSubmit(@Body() dto: ApplicantPhotoPreSubmitCompleteDto) {
    return { success: true, data: await this.svc.completeApplicantPhotoPreSubmit(dto) };
  }

  @Post('public/photo/presign')
  @Public()
  @Throttle({ api: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Public applicant passport-photo upload presign' })
  async presignApplicantPhoto(@Body() dto: ApplicantPhotoPresignDto) {
    return { success: true, data: await this.svc.presignApplicantPhoto(dto) };
  }

  @Post('public/photo/complete')
  @Public()
  @Throttle({ api: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete and verify public applicant passport-photo upload' })
  async completeApplicantPhoto(@Body() dto: ApplicantPhotoCompleteDto) {
    return { success: true, data: await this.svc.completeApplicantPhoto(dto) };
  }

  @Get('applications')
  @Roles('SUPER_ADMIN','REGISTRAR','STAFF')
  @ApiQuery({ name: 'status',        required: false, enum: ApplicantStatus })
  @ApiQuery({ name: 'admissionType', required: false, enum: AdmissionType })
  @ApiQuery({ name: 'cycleId',       required: false })
  @ApiQuery({ name: 'page',          required: false, type: Number })
  @ApiQuery({ name: 'pageSize',      required: false, type: Number })
  async getApplications(
    @Query('status')        status?:        ApplicantStatus,
    @Query('admissionType') admissionType?: AdmissionType,
    @Query('cycleId')       cycleId?:       string,
    @Query('page',    new ParseIntPipe({ optional: true })) page     = 1,
    @Query('pageSize',new ParseIntPipe({ optional: true })) pageSize = 50,
  ) {
    const result = await this.svc.findAll({
      status, admissionType, cycleId, page, pageSize: Math.min(pageSize, 200),
    });
    return {
      success: true, data: result.applicants,
      meta: { total: result.total, page, pageSize, totalPages: result.totalPages },
    };
  }

  @Get('applications/:id')
  @Roles('SUPER_ADMIN','REGISTRAR','STAFF')
  async getApplication(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.findById(id) };
  }

  @Get('applications/:id/accessibility-support')
  @Roles('SUPER_ADMIN','REGISTRAR','STAFF')
  @StaffScopes('accessibility_support')
  async getAccessibilitySupport(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.getAccessibilitySupport(id) };
  }

  @Patch('applications/:id/accessibility-support')
  @Roles('SUPER_ADMIN','REGISTRAR','STAFF')
  @StaffScopes('accessibility_support')
  async updateAccessibilitySupport(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccessibilitySupportDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.updateAccessibilitySupport(id, dto, u.sub) };
  }

  @Get('applications/:id/change-requests')
  @Roles('SUPER_ADMIN','REGISTRAR','STAFF')
  @StaffScopes('admissions_corrections')
  async listChangeRequests(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.listApplicationChangeRequests(id) };
  }

  @Patch('applications/:id/change-requests/:requestId')
  @Roles('SUPER_ADMIN','REGISTRAR','STAFF')
  @StaffScopes('admissions_corrections')
  async updateChangeRequest(@Param('id', ParseUUIDPipe) id: string, @Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: UpdateApplicationChangeRequestDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.updateApplicationChangeRequest(id, requestId, dto, u.sub) };
  }

  /**
   * Deep-audit fix (Aug 2026): staff-only (mirrors updateStatus() below) —
   * O'Level results are recorded during document verification/screening
   * against physical/scanned certificates, the same real-world workflow
   * the existing oLevelVerifyJobId field already implies, not applicant
   * self-service. See RecordOLevelResultsDto's docblock for the full
   * background.
   */
  @Post('applications/:id/olevel-results')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiOperation({ summary: "[STAFF] Record an applicant's O'Level results and evaluate eligibility" })
  async recordOLevelResults(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordOLevelResultsDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.recordOLevelResults(id, dto, u.sub) };
  }

  @Get('applications/:id/olevel-eligibility')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiOperation({ summary: "[STAFF] Check an applicant's O'Level eligibility against verified results on file" })
  async checkOLevelEligibility(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.checkOLevelEligibility(id) };
  }

  @Patch('applications/:id/olevel-verification')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiOperation({ summary: "[STAFF] Verify or reject all submitted O'Level sittings" })
  async verifyOLevel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyOLevelResultsDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.recordOLevelVerification(id, dto.status as VerificationStatus, u.sub, dto.remarks) };
  }

  @Patch('applications/:id/jamb-verification')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiOperation({ summary: '[STAFF] Record manual JAMB verification when provider integration is unavailable' })
  async verifyJamb(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyJambDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.updateJambVerification(id, dto.verified, dto.score, u.sub, dto.remarks) };
  }

  @Patch('applications/:id/status')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiOperation({ summary: '[REGISTRAR] Update application status (FSM)' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicantStatusDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.updateStatus(id, dto, u.sub) };
  }

  @Get('applications/:id/eligibility')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiOperation({ summary: '[STAFF] Evaluate complete admission eligibility against programme policy' })
  async evaluateEligibility(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.evaluateApplicationEligibility(id) };
  }

  @Post('applications/:id/documents')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiOperation({ summary: '[STAFF] Register an application document after secure storage upload' })
  async registerDocument(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterApplicationDocumentDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.registerDocument(id, dto, u.sub) }; }

  @Patch('applications/:id/documents/:documentId/verification')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiOperation({ summary: '[STAFF] Verify or reject an application document' })
  async verifyDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: VerifyApplicationDocumentDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.recordDocumentVerification(id, documentId, body.status as VerificationStatus, u.sub, body.rejectionReason) };
  }

  @Post('screen/bulk')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Bulk screen PENDING applicants against configured admission policy' })
  async screenBulk(@Body() dto: ScreenApplicantsDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.screenBulk(dto, u.sub) };
  }
}
