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
  CreateFeeScheduleDto, DecideWaiverDto, RequestWaiverDto, UpdateFeeScheduleDto,
} from './dto/fees.dto';
import { FeesService } from './fees.service';

@ApiTags('Fees')
@Controller({ path: 'fees', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class FeesController {
  constructor(private readonly svc: FeesService) {}

  // ── Fee Schedules ────────────────────────────────────────────────────────
  @Get('schedules')
  @Roles('SUPER_ADMIN','BURSAR','REGISTRAR','HOD','STUDENT')
  @ApiQuery({ name: 'academicYear', required: false })
  async getSchedules(@Query('academicYear') academicYear?: string) {
    return { success: true, data: await this.svc.findAllSchedules(academicYear) };
  }

  @Post('schedules')
  @Roles('BURSAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[BURSAR] Create a fee schedule' })
  async createSchedule(@Body() dto: CreateFeeScheduleDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createSchedule(dto, u.sub) };
  }

  @Patch('schedules/:id')
  @Roles('BURSAR','SUPER_ADMIN')
  async updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeeScheduleDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.updateSchedule(id, dto, u.sub) };
  }

  @Post('schedules/:id/generate-invoices')
  @Roles('BURSAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[BURSAR] Queue bulk invoice generation for this schedule (idempotent)' })
  async generateInvoices(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.generateInvoices(id, u.sub) };
  }

  // ── Student Fees ─────────────────────────────────────────────────────────
  @Get('students/:studentId')
  @Roles('STUDENT','BURSAR','REGISTRAR','SUPER_ADMIN','HOD')
  @ApiQuery({ name: 'academicYear', required: false })
  @ApiOperation({ summary: 'Get a student\'s fee records (students see only own)' })
  async getStudentFees(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYear') academicYear: string | undefined,
    @CurrentUser() u: JwtPayload,
  ) {
    const targetId = resolveSelfOrTargetStudentId(u, studentId);
    return { success: true, data: await this.svc.getStudentFees(targetId, academicYear) };
  }

  @Get('invoices/:id')
  @Roles('STUDENT','BURSAR','REGISTRAR','SUPER_ADMIN')
  async getFeeById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    const fee = await this.svc.findFeeById(id);
    if (u.role === 'STUDENT') {
      const ownStudentId = resolveSelfOrTargetStudentId(u, fee.studentId);
      if (fee.studentId !== ownStudentId) {
        // Same 403 shape as RBAC_FORBIDDEN — students cannot view others' invoices
        return { success: false, error: { code: 'RBAC_FORBIDDEN', message: 'Access denied' } };
      }
    }
    return { success: true, data: fee };
  }

  // ── Waivers ──────────────────────────────────────────────────────────────
  @Post('waivers')
  @Roles('HOD','BURSAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[HOD: ≤cap → pending Bursar approval | BURSAR: ≤cap → auto-approved]' })
  async requestWaiver(@Body() dto: RequestWaiverDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.requestWaiver(dto, u.sub, u.role, u.staffScope?.deptId) };
  }

  @Get('waivers/pending')
  @Roles('BURSAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[BURSAR] List waivers awaiting approval' })
  async getPendingWaivers() {
    return { success: true, data: await this.svc.findPendingWaivers() };
  }

  @Patch('waivers/:id/approve')
  @Roles('BURSAR','SUPER_ADMIN')
  async approveWaiver(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.approveWaiver(id, u.sub, u.role) };
  }

  @Patch('waivers/:id/reject')
  @Roles('BURSAR','SUPER_ADMIN')
  async rejectWaiver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideWaiverDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.rejectWaiver(id, u.sub, u.role, dto.note) };
  }
}
