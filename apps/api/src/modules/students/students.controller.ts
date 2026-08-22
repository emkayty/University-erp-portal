import {
  Body, Controller, Get, Param, ParseEnumPipe,
  ParseIntPipe, ParseUUIDPipe, Patch, Post,
  Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StudentStatus } from '@prisma/client';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Roles, StaffScopes } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiresActiveCalendar } from '../../common/guards/calendar.guard';
import { resolveSelfOrTargetStudentId } from '../../common/resolve-self-or-target';
import { MatriculateDto, RegisterCoursesDto, UpdateStudentDto, UpdateStudentStatusDto } from './dto/students.dto';
import { StudentsService } from './students.service';
import { AdmissionsService } from '../admissions/admissions.service';

@ApiTags('Students')
@Controller({ path: 'students', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class StudentsController {
  constructor(
    private readonly svc:         StudentsService,
    private readonly admSvc:      AdmissionsService,
  ) {}

  // ── Matriculation ──────────────────────────────────────────────────────────
  @Post('matriculate')
  @Roles('REGISTRAR', 'SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Matriculate an accepted applicant → creates Student + User' })
  async matriculate(@Body() dto: MatriculateDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.matriculate(dto, u.sub) };
  }

  // ── Student list / profile ─────────────────────────────────────────────────
  @Get('directory')
  @Roles('STAFF', 'SUPPORT_STAFF')
  @StaffScopes('records')
  @ApiOperation({ summary: 'List active students for records-scoped staff operations' })
  @ApiQuery({ name: 'programmeId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'level', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Matric number, name, or email' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async directory(
    @Query('programmeId') programmeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('level', new ParseIntPipe({ optional: true })) level?: number,
    @Query('search') search?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 50,
    @CurrentUser() user?: JwtPayload,
  ) {
    const result = await this.svc.findAll({
      status: StudentStatus.ACTIVE,
      programmeId,
      departmentId: departmentId ?? user?.staffScope?.deptId,
      facultyId: user?.staffScope?.facultyId,
      level,
      search,
      page,
      pageSize: Math.min(pageSize, 200),
    });
    return {
      success: true,
      data: {
        students: result.students,
        total: result.total,
        page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    };
  }

  @Get()
  @Roles('SUPER_ADMIN', 'REGISTRAR', 'HOD', 'DEAN', 'BURSAR')
  @ApiQuery({ name: 'status',       required: false, enum: StudentStatus })
  @ApiQuery({ name: 'programmeId',  required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'level',        required: false, type: Number })
  @ApiQuery({ name: 'page',         required: false, type: Number })
  @ApiQuery({ name: 'pageSize',     required: false, type: Number })
  @ApiQuery({ name: 'search',       required: false, description: 'Matric number, name, or email' })
  async findAll(
    @Query('status')        status?:       StudentStatus,
    @Query('programmeId')   programmeId?:  string,
    @Query('departmentId')  departmentId?: string,
    @Query('level', new ParseIntPipe({ optional: true })) level?: number,
    @Query('search') search?: string,
    @Query('page',  new ParseIntPipe({ optional: true })) page     = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 50,
  ) {
    const result = await this.svc.findAll({
      status, programmeId, departmentId, level, search, page,
      pageSize: Math.min(pageSize, 200),
    });
    return {
      success: true, data: result.students,
      meta: { total: result.total, page, pageSize, totalPages: result.totalPages },
    };
  }

  @Get(':id')
  @Roles('SUPER_ADMIN','REGISTRAR','HOD','DEAN','BURSAR','STAFF','STUDENT')
  @ApiOperation({ summary: 'Get student profile (students see own; staff see all)' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: JwtPayload,
  ) {
    const targetId = resolveSelfOrTargetStudentId(u, id);
    return { success: true, data: await this.svc.findById(targetId) };
  }

  @Get('by-matric/:matricNo')
  @Roles('SUPER_ADMIN','REGISTRAR','HOD','BURSAR','STAFF')
  @ApiOperation({ summary: 'Look up student by matric number' })
  async findByMatricNo(@Param('matricNo') matricNo: string) {
    return { success: true, data: await this.svc.findByMatricNo(matricNo) };
  }

  @Patch(':id')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF')
  @ApiOperation({ summary: 'Update student profile fields' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.update(id, dto, u.sub) };
  }

  @Patch(':id/status')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Suspend / withdraw / defer / reinstate a student' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentStatusDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.updateStatus(id, dto, u.sub) };
  }

  /**
   * GET /students/:id/graduation-eligibility
   * Deep-audit fix (Aug 2026): previously no endpoint anywhere exposed a
   * real academic-completion check — only ClearanceService's
   * administrative-only eligibleForGraduation existed. Returns both halves
   * separately so a registrar can see exactly what's blocking a student.
   */
  @Get(':id/graduation-eligibility')
  @Roles('REGISTRAR','SUPER_ADMIN','STAFF','STUDENT')
  @ApiOperation({ summary: 'Check academic + administrative graduation eligibility' })
  async checkGraduationEligibility(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    // Deep-audit fix (Aug 2026): the adjacent getRegisteredCourses() and
    // getAcademicHistory() endpoints both self-scope a STUDENT caller to
    // their own record; this one didn't, so a student could look up any
    // other student's CGPA/credit-units/missing-courses by ID. Same fix.
    const targetId = resolveSelfOrTargetStudentId(u, id);
    return { success: true, data: await this.svc.checkAcademicEligibility(targetId) };
  }

  /**
   * POST /students/:id/graduate
   * Deep-audit fix (Aug 2026): this endpoint did not exist at all — there
   * was no code path anywhere, automatic or manual, that could move a
   * student to GRADUATED. See docs/CHANGELOG.md finding 1.1.
   */
  @Post(':id/graduation-candidate')
  @Roles('REGISTRAR','HOD','DEAN','SUPER_ADMIN')
  @ApiOperation({ summary: 'Run graduation audit and create/update the candidate record' })
  async createGraduationCandidate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createGraduationCandidate(id, u.sub) };
  }

  @Post(':id/graduation-approve')
  @Roles('VC','REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: 'Approve a graduation candidate after independent review' })
  async approveGraduation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.approveGraduation(id, u.sub) };
  }

  @Post(':id/graduate')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Graduate a student — checks academic + administrative eligibility, then creates their alumni record' })
  async graduate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.graduate(id, u.sub) };
  }

  // ── Course Registration ────────────────────────────────────────────────────
  @Post(':id/register-courses')
  @Roles('STUDENT','REGISTRAR','SUPER_ADMIN')
  @RequiresActiveCalendar()
  @ApiOperation({ summary: '[STUDENT] Register courses for active semester (fee gate + prerequisites enforced)' })
  async registerCourses(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterCoursesDto,
    @CurrentUser() u: JwtPayload,
  ) {
    // Students may only register their own courses
    const targetId = resolveSelfOrTargetStudentId(u, id);
    return { success: true, data: await this.svc.registerCourses(targetId, dto, u.sub) };
  }

  @Patch(':id/courses/:courseOfferingId/drop')
  @Roles('STUDENT','REGISTRAR','SUPER_ADMIN')
  @RequiresActiveCalendar()
  @ApiOperation({ summary: '[STUDENT] Drop a registered course (within add/drop window only)' })
  async dropCourse(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    const targetId = resolveSelfOrTargetStudentId(u, id);
    await this.svc.dropCourse(targetId, courseOfferingId, u.sub);
    return { success: true, data: { message: 'Course dropped successfully' } };
  }

  @Get(':id/registered-courses')
  @Roles('STUDENT','REGISTRAR','HOD','STAFF','SUPER_ADMIN')
  async getRegisteredCourses(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: JwtPayload,
  ) {
    const targetId = resolveSelfOrTargetStudentId(u, id);
    return { success: true, data: await this.svc.getRegisteredCourses(targetId) };
  }

  @Get(':id/academic-history')
  @Roles('STUDENT','REGISTRAR','HOD','DEAN','SUPER_ADMIN')
  async getAcademicHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: JwtPayload,
  ) {
    const targetId = resolveSelfOrTargetStudentId(u, id);
    return { success: true, data: await this.svc.getAcademicHistory(targetId) };
  }
}
