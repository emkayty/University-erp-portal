import {
  Body, Controller, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { resolveSelfOrTargetStudentId } from '../../common/resolve-self-or-target';
import {
  AmendResultDto, BulkResultActionDto, BulkSubmitResultsDto,
  ResultActionDto, SubmitResultDto, WithholdResultDto,
} from './dto/results.dto';
import { ResultsService } from './results.service';

@ApiTags('Results')
@Controller({ path: 'results', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class ResultsController {
  constructor(private readonly svc: ResultsService) {}

  @Post()
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[LECTURER] Submit / update a single result (creates or updates DRAFT)' })
  async submit(@Body() dto: SubmitResultDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.submitResult(dto, u.sub, u.role) };
  }

  @Post('bulk')
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[LECTURER] Bulk submit results for a course offering' })
  async bulkSubmit(@Body() dto: BulkSubmitResultsDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.bulkSubmit(dto, u.sub, u.role) };
  }

  @Patch(':id/action')
  @Roles('HOD','DEAN','REGISTRAR','VC','SUPER_ADMIN')
  @ApiOperation({ summary: 'Advance result through FSM. SENATE_PUBLISH triggers atomic CGPA update (M1 fix).' })
  async applyAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResultActionDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.applyAction(id, dto, u.sub, u.role) };
  }

  @Post('bulk-action')
  @Roles('HOD','DEAN','REGISTRAR','VC','SUPER_ADMIN')
  @ApiOperation({ summary: 'Apply a FSM action to multiple results at once' })
  async bulkAction(@Body() dto: BulkResultActionDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.bulkAction(dto, u.sub, u.role) };
  }

  // AUDIT-C2: these three did not exist before this fix — a published
  // result had no correction path at all.
  @Post(':id/amend')
  @Roles('HOD','DEAN','SUPER_ADMIN')
  @ApiOperation({ summary: 'Amend a SENATE_PUBLISHED result. Single transaction: updates score/grade + recomputes CGPA (spec §11.4/§7B).' })
  async amend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmendResultDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.amend(id, dto, u.sub, u.role) };
  }

  @Patch(':id/withhold')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: 'Withhold a published result pending clearance or disciplinary action (spec §11.4). Excludes it from CGPA until released.' })
  async withhold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WithholdResultDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.withhold(id, dto, u.sub, u.role) };
  }

  @Patch(':id/release-withhold')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: 'Release a withheld result back to SENATE_PUBLISHED and recompute CGPA.' })
  async releaseWithhold(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.releaseWithhold(id, u.sub, u.role) };
  }

  @Get('course-offering/:id/report')
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  async courseReport(@Param('id',ParseUUIDPipe)id:string,@Query('semesterId')semesterId:string){return {success:true,data:await this.svc.getCourseReport(id,semesterId)};}

  @Get('semester/:id/report')
  @Roles('HOD','DEAN','REGISTRAR','VC','SUPER_ADMIN')
  async semesterReport(@Param('id',ParseUUIDPipe)id:string){return {success:true,data:await this.svc.getSemesterReport(id)};}

  @Get('course-offering/:id')
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  @ApiQuery({ name: 'semesterId', required: true })
  async getByCourseOffering(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('semesterId') semesterId: string,
  ) {
    return { success: true, data: await this.svc.getResultsByOffering(id, semesterId) };
  }

  @Get('student/:id')
  @Roles('STUDENT','STAFF','HOD','REGISTRAR','SUPER_ADMIN')
  @ApiQuery({ name: 'semesterId', required: false })
  async getStudentResults(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('semesterId') semesterId: string | undefined,
    @CurrentUser() u: JwtPayload,
  ) {
    const targetId = resolveSelfOrTargetStudentId(u, id);
    return { success: true, data: await this.svc.getStudentResults(targetId, semesterId, u.role) };
  }

  @Get('student/:id/transcript')
  @Roles('STUDENT','REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: 'Full academic transcript with CGPA, degree class, semester breakdown' })
  async getTranscript(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    const targetId = resolveSelfOrTargetStudentId(u, id);
    return { success: true, data: await this.svc.getTranscriptData(targetId) };
  }
}
