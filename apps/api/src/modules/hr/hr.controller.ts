import {
  Body, Controller, Get, Param, ParseEnumPipe,
  ParseIntPipe, ParseUUIDPipe, Patch, Post,
  Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EmploymentStatus } from '@prisma/client';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSalaryGradeDto, CreateStaffDto, LeaveDecisionDto, RequestLeaveDto } from './dto/hr.dto';
import { HrService } from './hr.service';

@ApiTags('HR')
@Controller({ path: 'hr', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class HrController {
  constructor(private readonly svc: HrService) {}

  // ── Salary Grades ─────────────────────────────────────────────────────────
  @Post('salary-grades')
  @Roles('HR_MANAGER','SUPER_ADMIN')
  @ApiOperation({ summary: '[HR_MANAGER] Create salary grade (GL-07, CONTISS-03, etc.)' })
  async createGrade(@Body() dto: CreateSalaryGradeDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createSalaryGrade(dto, u.sub) };
  }

  @Get('salary-grades')
  @Roles('HR_MANAGER','BURSAR','REGISTRAR','SUPER_ADMIN','STAFF')
  async getGrades() {
    return { success: true, data: await this.svc.findAllSalaryGrades() };
  }

  // ── Staff ─────────────────────────────────────────────────────────────────
  @Post('staff')
  @Roles('HR_MANAGER','SUPER_ADMIN')
  @ApiOperation({ summary: '[HR_MANAGER] Onboard a new staff member' })
  async createStaff(@Body() dto: CreateStaffDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createStaff(dto, u.sub) };
  }

  @Get('staff')
  @Roles('HR_MANAGER','REGISTRAR','BURSAR','HOD','DEAN','SUPER_ADMIN')
  @ApiQuery({ name: 'departmentId',     required: false })
  @ApiQuery({ name: 'employmentStatus', required: false, enum: EmploymentStatus })
  @ApiQuery({ name: 'page',             required: false, type: Number })
  @ApiQuery({ name: 'pageSize',         required: false, type: Number })
  async getStaff(
    @Query('departmentId')     departmentId?:     string,
    @Query('employmentStatus') employmentStatus?: EmploymentStatus,
    @Query('page',     new ParseIntPipe({ optional: true })) page     = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 50,
  ) {
    const result = await this.svc.findAll({
      departmentId, employmentStatus, page, pageSize: Math.min(pageSize, 200),
    });
    return { success: true, data: result.staff, meta: { total: result.total, page, pageSize, totalPages: result.totalPages } };
  }

  @Get('staff/:id')
  @Roles('HR_MANAGER','REGISTRAR','HOD','DEAN','SUPER_ADMIN','STAFF')
  async getStaffById(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.findById(id) };
  }

  @Patch('staff/:id/retire')
  @Roles('HR_MANAGER','SUPER_ADMIN')
  @ApiOperation({ summary: '[HR_MANAGER] Retire a staff member' })
  async retire(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.retire(id, u.sub) };
  }

  // ── Leave ─────────────────────────────────────────────────────────────────
  @Post('leave/request')
  @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN','HR_MANAGER')
  @ApiOperation({ summary: '[STAFF] Request leave — overlap check enforced' })
  async requestLeave(@Body() dto: RequestLeaveDto, @CurrentUser() u: JwtPayload) {
    // Staff request for their own record — HR/Admin pass staffId via body (extended in P8)
    return { success: true, data: await this.svc.requestLeave(dto, u.sub) };
  }

  @Get('leave/pending')
  @Roles('HR_MANAGER','HOD','REGISTRAR','SUPER_ADMIN')
  @ApiQuery({ name: 'departmentId', required: false })
  async getPendingLeaves(@Query('departmentId') departmentId?: string) {
    return { success: true, data: await this.svc.findPendingLeaves(departmentId) };
  }

  @Patch('leave/:id/decide')
  @Roles('HR_MANAGER','HOD','REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[HR_MANAGER / HOD] Approve or reject a leave request' })
  async decideLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveDecisionDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.decideLeave(id, dto, u.sub, u.role) };
  }
}
