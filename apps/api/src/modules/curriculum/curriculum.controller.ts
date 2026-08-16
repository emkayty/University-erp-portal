import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  AddPrerequisiteDto, AddProgrammeCourseDto, CreateCourseDto,
  CreateCourseOfferingDto, CreateDepartmentDto, CreateFacultyDto, TransitionCourseOfferingDto,
  CreateProgrammeDto, UpdateCourseDto, UpdateDepartmentDto,
  UpdateFacultyDto, UpdateProgrammeDto,
} from './dto/curriculum.dto';
import { CurriculumService } from './curriculum.service';

@ApiTags('Curriculum')
@Controller({ path: 'curriculum', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class CurriculumController {
  constructor(private readonly svc: CurriculumService) {}

  // ── Faculties ──────────────────────────────────────────────────────────────
  @Get('faculties')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD','STAFF','STUDENT')
  @ApiOperation({ summary: 'List all faculties' })
  async faculties() { return { success: true, data: await this.svc.findAllFaculties() }; }

  @Get('faculties/:id')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD','STAFF','STUDENT')
  async faculty(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.findFacultyById(id) };
  }

  @Post('faculties')
  @Roles('SUPER_ADMIN','REGISTRAR')
  @ApiOperation({ summary: '[REGISTRAR] Create faculty' })
  async createFaculty(@Body() dto: CreateFacultyDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createFaculty(dto, u.sub) };
  }

  @Patch('faculties/:id')
  @Roles('SUPER_ADMIN','REGISTRAR')
  async updateFaculty(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFacultyDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.updateFaculty(id, dto, u.sub) };
  }

  // ── Departments ────────────────────────────────────────────────────────────
  @Get('departments')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD','STAFF','STUDENT')
  @ApiQuery({ name: 'facultyId', required: false })
  async departments(@Query('facultyId') facultyId?: string) {
    return { success: true, data: await this.svc.findAllDepartments(facultyId) };
  }

  @Post('departments')
  @Roles('SUPER_ADMIN','REGISTRAR')
  @ApiOperation({ summary: '[REGISTRAR] Create department' })
  async createDept(@Body() dto: CreateDepartmentDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createDepartment(dto, u.sub) };
  }

  @Patch('departments/:id')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN')
  async updateDept(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.updateDepartment(id, dto, u.sub) };
  }

  // ── Programmes ─────────────────────────────────────────────────────────────
  @Get('programmes')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD','STAFF','STUDENT')
  @ApiQuery({ name: 'departmentId', required: false })
  async programmes(@Query('departmentId') departmentId?: string) {
    return { success: true, data: await this.svc.findAllProgrammes(departmentId) };
  }

  @Get('programmes/:id')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD','STAFF','STUDENT')
  async programme(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.findProgrammeById(id) };
  }

  @Post('programmes')
  @Roles('SUPER_ADMIN','REGISTRAR')
  async createProgramme(@Body() dto: CreateProgrammeDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createProgramme(dto, u.sub) };
  }

  @Patch('programmes/:id')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN')
  async updateProgramme(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProgrammeDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.updateProgramme(id, dto, u.sub) };
  }

  @Post('programmes/:id/courses')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD')
  @ApiOperation({ summary: 'Add course to programme curriculum' })
  async addProgrammeCourse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddProgrammeCourseDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.addProgrammeCourse(id, dto, u.sub) };
  }

  @Delete('programmes/:id/courses/:courseId')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN')
  @ApiQuery({ name: 'level', required: true, type: Number })
  @ApiQuery({ name: 'semester', required: true })
  async removeProgrammeCourse(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query('level') level: string,
    @Query('semester') semester: string,
    @CurrentUser() u: JwtPayload,
  ) {
    await this.svc.removeProgrammeCourse(id, courseId, parseInt(level), semester, u.sub);
    return { success: true, data: { message: 'Course removed from programme' } };
  }

  // ── Courses ────────────────────────────────────────────────────────────────
  @Get('courses')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD','STAFF','STUDENT')
  @ApiQuery({ name: 'departmentId', required: false })
  async courses(@Query('departmentId') departmentId?: string) {
    return { success: true, data: await this.svc.findAllCourses(departmentId) };
  }

  @Get('courses/:id')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD','STAFF','STUDENT')
  async course(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.findCourseById(id) };
  }

  @Post('courses')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD')
  @ApiOperation({ summary: '[HOD+] Create course' })
  async createCourse(@Body() dto: CreateCourseDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createCourse(dto, u.sub) };
  }

  @Patch('courses/:id')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD')
  async updateCourse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.updateCourse(id, dto, u.sub) };
  }

  @Post('courses/:id/prerequisites')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD')
  @ApiOperation({ summary: 'Add prerequisite (cycle detection applied)' })
  async addPrereq(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddPrerequisiteDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.addPrerequisite(id, dto, u.sub) };
  }

  @Delete('courses/:id/prerequisites/:prereqId')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD')
  async removePrereq(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('prereqId', ParseUUIDPipe) prereqId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    await this.svc.removePrerequisite(id, prereqId, u.sub);
    return { success: true, data: { message: 'Prerequisite removed' } };
  }

  // ── Offerings ──────────────────────────────────────────────────────────────
  @Get('offerings')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD','STAFF','STUDENT')
  @ApiQuery({ name: 'calendarId', required: false })
  @ApiQuery({ name: 'semester',   required: false })
  async offerings(@Query('calendarId') calendarId?: string, @Query('semester') semester?: string) {
    return { success: true, data: await this.svc.findOfferings(calendarId, semester) };
  }

  @Post('offerings')
  @Roles('SUPER_ADMIN','REGISTRAR')
  @ApiOperation({ summary: '[REGISTRAR] Create course offering for a semester' })
  async createOffering(@Body() dto: CreateCourseOfferingDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createOffering(dto, u.sub) };
  }

  @Patch('offerings/:id/lifecycle')
  @Roles('SUPER_ADMIN','REGISTRAR','DEAN','HOD')
  @ApiOperation({ summary: 'Advance a course offering through its academic lifecycle' })
  async transitionOffering(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionCourseOfferingDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.transitionOffering(id, dto, u.sub) };
  }

  // ── CCMAS Compliance ───────────────────────────────────────────────────────
  @Get('ccmas-compliance')
  @Roles('SUPER_ADMIN','REGISTRAR','VC')
  @ApiOperation({ summary: '[REGISTRAR] NUC CCMAS 70/30 compliance report for all programmes' })
  async ccmasCompliance() {
    return { success: true, data: await this.svc.getCcmasCompliance() };
  }
}
