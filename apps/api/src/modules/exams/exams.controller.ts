import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { resolveSelfOrTargetStudentId } from '../../common/resolve-self-or-target';
import { BulkAttendanceDto, BulkExamAttendanceDto, CreateExamTimetableDto, CreateSemesterDto, RecordAttendanceDto, RecordExamMarkDto, UpdateExamTimetableDto } from './dto/exams.dto';
import { ExamsService } from './exams.service';

@ApiTags('Exams')
@Controller({ path: 'exams', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class ExamsController {
  constructor(private readonly svc: ExamsService) {}

  @Post('semesters')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Create semester with enrollment + exam date windows (M2 fix)' })
  async createSemester(@Body() dto: CreateSemesterDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createSemester(dto, u.sub) };
  }

  @Get('semesters')
  @Roles('STUDENT','STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN','BURSAR')
  @ApiQuery({ name: 'academicYear', required: false })
  async getSemesters(@Query('academicYear') year?: string) {
    return { success: true, data: await this.svc.findAllSemesters(year) };
  }

  @Get('semesters/current')
  @Roles('STUDENT','STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN','BURSAR')
  async getCurrent() {
    return { success: true, data: await this.svc.getCurrentSemester() };
  }

  @Patch('semesters/:id/set-current')
  @Roles('REGISTRAR','SUPER_ADMIN')
  async setCurrentSemester(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.setCurrentSemester(id, u.sub) };
  }

  @Patch('semesters/:id/advance-status')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: 'PLANNING→REGISTRATION→ACTIVE→EXAMS→RESULT_ENTRY→COMPLETED' })
  async advanceStatus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.advanceSemesterStatus(id, u.sub) };
  }

  @Post('timetable')
  @Roles('REGISTRAR','SUPER_ADMIN','HOD')
  @ApiOperation({ summary: '[REGISTRAR] Create timetable entry — venue clash detection included' })
  async createTimetable(@Body() dto: CreateExamTimetableDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createTimetableEntry(dto, u.sub, u.role) };
  }

  @Patch('timetable/:id')
  @Roles('REGISTRAR','SUPER_ADMIN','HOD')
  @ApiOperation({ summary: '[REGISTRAR] Reschedule an examination with full clash and capacity revalidation' })
  async updateTimetable(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamTimetableDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.updateTimetableEntry(id, dto, u.sub, u.role) };
  }

  @Delete('timetable/:id')
  @Roles('REGISTRAR','SUPER_ADMIN','HOD')
  @ApiOperation({ summary: '[REGISTRAR] Cancel an examination only before candidates or attendance exist' })
  async cancelTimetable(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.cancelTimetableEntry(id, u.sub, u.role) };
  }

  @Get('timetable/:semesterId')
  @Roles('STUDENT','STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  async getTimetable(@Param('semesterId', ParseUUIDPipe) semesterId: string) {
    return { success: true, data: await this.svc.getTimetable(semesterId) };
  }

  @Post('timetable/:id/generate-candidates')
  @Roles('REGISTRAR','SUPER_ADMIN','HOD')
  async generateCandidates(@Param('id', ParseUUIDPipe) id:string,@CurrentUser()u:JwtPayload){return {success:true,data:await this.svc.generateCandidates(id,u.sub,u.role)};}

  @Get('timetable/:id/candidates')
  @Roles('STUDENT','STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  async getCandidates(@Param('id', ParseUUIDPipe) id:string,@CurrentUser()u:JwtPayload){return {success:true,data:await this.svc.getCandidates(id,u)};}

  @Post('timetable/:id/attendance/bulk')
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  async bulkExamAttendance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BulkExamAttendanceDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.bulkRecordExamAttendance(id, dto.records, u.sub, u.role) };
  }

  @Post('timetable/:id/attendance/:studentId')
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  async examAttendance(@Param('id',ParseUUIDPipe) id:string,@Param('studentId',ParseUUIDPipe) studentId:string,@Body() body:{status:string;incidentNote?:string},@CurrentUser()u:JwtPayload){return {success:true,data:await this.svc.recordExamAttendance(id,studentId,body.status,u.sub,body.incidentNote,u.role)};}

  @Post('timetable/:id/marks')
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  async examMark(@Param('id',ParseUUIDPipe) id:string,@Body() dto:RecordExamMarkDto,@CurrentUser()u:JwtPayload){return {success:true,data:await this.svc.recordExamMark(id,dto,u.sub,u.role)};}

  @Get('timetable/:id/report')
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  async examReport(@Param('id',ParseUUIDPipe) id:string,@CurrentUser()u:JwtPayload){return {success:true,data:await this.svc.getExamReport(id,u.sub,u.role)};}

  @Post('attendance')
  @Roles('STAFF','HOD','DEAN','SUPER_ADMIN')
  @ApiOperation({ summary: '[LECTURER] Record / update attendance for one student (upsert)' })
  async recordAttendance(@Body() dto: RecordAttendanceDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.recordAttendance(dto, u.sub, u.role) };
  }

  @Post('attendance/bulk')
  @Roles('STAFF','HOD','DEAN','SUPER_ADMIN')
  @ApiOperation({ summary: '[LECTURER] Bulk-record attendance for an entire class session' })
  async bulkAttendance(@Body() dto: BulkAttendanceDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.bulkRecordAttendance(dto, u.sub, u.role) };
  }

  @Get('attendance/student/:studentId/course/:courseOfferingId')
  @Roles('STUDENT','STAFF','HOD','REGISTRAR','SUPER_ADMIN')
  async getAttendanceSummary(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    const targetId = resolveSelfOrTargetStudentId(u, studentId);
    return { success: true, data: await this.svc.getAttendanceSummary(targetId, courseOfferingId) };
  }

  @Get('attendance/course/:courseOfferingId')
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN')
  @ApiQuery({ name: 'date', required: false, description: 'Filter by date YYYY-MM-DD' })
  async getCourseAttendance(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Query('date') date?: string,
  ) {
    return { success: true, data: await this.svc.getCourseAttendance(courseOfferingId, date) };
  }
}
