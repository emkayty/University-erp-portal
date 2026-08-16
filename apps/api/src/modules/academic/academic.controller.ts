import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';

import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AcademicService } from './academic.service';
import {
  DecideAcademicAppealDto,
  DecideAcademicInterruptionDto,
  DecideProgrammeTransferDto,
  IssueAcademicCredentialDto,
  RequestAcademicInterruptionDto,
  RequestProgrammeTransferDto,
  RevokeAcademicCredentialDto,
  SubmitAcademicAppealDto,
} from './dto/academic-lifecycle.dto';

@ApiTags('Academic Journey')
@Controller({ path: 'academic', version: '1' })
@UseGuards(RolesGuard)
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  @Get('me/journey')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Get the authenticated student academic journey' })
  journey(@CurrentUser() user: JwtPayload) {
    return this.academic.getJourneyForUser(user.sub);
  }

  @Get('students/:studentId/journey')
  @Roles('SUPER_ADMIN', 'VC', 'REGISTRAR', 'DEAN', 'HOD')
  @ApiOperation({ summary: 'Get a student academic journey for authorized academic officers' })
  journeyForStudent(@Param('studentId') studentId: string) {
    return this.academic.getJourney(studentId);
  }

  @Get('me/degree-audit')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Get the latest degree audit for the authenticated student' })
  degreeAudit(@CurrentUser() user: JwtPayload) {
    return this.academic.getLatestDegreeAuditForUser(user.sub);
  }

  @Post('students/:studentId/degree-audit/run')
  @Roles('SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD')
  @ApiOperation({ summary: 'Run and persist a deterministic degree audit' })
  runDegreeAudit(@Param('studentId') studentId: string, @CurrentUser() user: JwtPayload) {
    return this.academic.runDegreeAudit(studentId, user.sub);
  }

  @Post('students/:studentId/progression/run')
  @Roles('SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD')
  @ApiOperation({ summary: 'Evaluate and persist policy-driven progression and academic standing' })
  runProgression(@Param('studentId') studentId: string, @CurrentUser() user: JwtPayload) {
    return this.academic.runProgression(studentId, user.sub);
  }

  @Post('placements/:placementId/apply')
  @Roles('SUPER_ADMIN', 'REGISTRAR')
  @ApiOperation({ summary: 'Apply an approved academic placement to the operational student record' })
  applyPlacement(@Param('placementId') placementId: string, @CurrentUser() user: JwtPayload) {
    return this.academic.applyPlacement(placementId, user.sub);
  }

  @Get('me/plan')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Get the authenticated student academic plan' })
  plan(@CurrentUser() user: JwtPayload) {
    return this.academic.getPlanForUser(user.sub);
  }

  @Post('me/appeals')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Submit an academic appeal with optional evidence reference' })
  submitAppeal(@CurrentUser() user: JwtPayload, @Body() dto: SubmitAcademicAppealDto) {
    return this.academic.submitAppealForUser(user.sub, dto);
  }

  @Post('appeals/:appealId/decision')
  @Roles('SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD')
  @ApiOperation({ summary: 'Record a final academic appeal decision' })
  decideAppeal(
    @Param('appealId') appealId: string,
    @Body() dto: DecideAcademicAppealDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.academic.decideAppeal(appealId, dto, user.sub);
  }

  @Post('me/programme-transfers')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Request a programme transfer' })
  requestProgrammeTransfer(@CurrentUser() user: JwtPayload, @Body() dto: RequestProgrammeTransferDto) {
    return this.academic.requestProgrammeTransferForUser(user.sub, dto);
  }

  @Post('programme-transfers/:requestId/decision')
  @Roles('SUPER_ADMIN', 'REGISTRAR')
  @ApiOperation({ summary: 'Approve or reject a programme transfer and atomically apply an approved target curriculum' })
  decideProgrammeTransfer(
    @Param('requestId') requestId: string,
    @Body() dto: DecideProgrammeTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.academic.decideProgrammeTransfer(requestId, dto, user.sub);
  }

  @Post('me/interruptions')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Request an academic interruption or deferment' })
  requestInterruption(@CurrentUser() user: JwtPayload, @Body() dto: RequestAcademicInterruptionDto) {
    return this.academic.requestInterruptionForUser(user.sub, dto);
  }

  @Post('interruptions/:interruptionId/decision')
  @Roles('SUPER_ADMIN', 'REGISTRAR')
  @ApiOperation({ summary: 'Approve or reject an academic interruption' })
  decideInterruption(
    @Param('interruptionId') interruptionId: string,
    @Body() dto: DecideAcademicInterruptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.academic.decideInterruption(interruptionId, dto, user.sub);
  }

  @Post('interruptions/:interruptionId/resume')
  @Roles('SUPER_ADMIN', 'REGISTRAR')
  @ApiOperation({ summary: 'Resume a completed academic interruption when its end date has elapsed' })
  resumeInterruption(@Param('interruptionId') interruptionId: string, @CurrentUser() user: JwtPayload) {
    return this.academic.resumeInterruption(interruptionId, user.sub);
  }

  @Post('credentials')
  @Roles('SUPER_ADMIN', 'REGISTRAR')
  @ApiOperation({ summary: 'Issue an immutable academic credential to a graduated student' })
  issueCredential(@Body() dto: IssueAcademicCredentialDto, @CurrentUser() user: JwtPayload) {
    return this.academic.issueCredential(dto, user.sub);
  }

  @Post('credentials/:credentialId/revoke')
  @Roles('SUPER_ADMIN', 'REGISTRAR')
  @ApiOperation({ summary: 'Revoke an issued academic credential with an auditable reason' })
  revokeCredential(
    @Param('credentialId') credentialId: string,
    @Body() dto: RevokeAcademicCredentialDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.academic.revokeCredential(credentialId, dto.reason, user.sub);
  }
}
