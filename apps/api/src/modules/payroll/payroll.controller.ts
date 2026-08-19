import {
  Body, Controller, Get, Header, Param, ParseIntPipe,
  ParseUUIDPipe, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreatePayrollRunDto, PayrollActionDto } from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

@ApiTags('Payroll')
@Controller({ path: 'payroll', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  @Post('runs')
  @Roles('BURSAR','HR_MANAGER','SUPER_ADMIN')
  @ApiOperation({ summary: '[BURSAR] Create a new payroll run for a month' })
  async createRun(@Body() dto: CreatePayrollRunDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createRun(dto, u.sub) };
  }

  @Get('runs')
  @Roles('BURSAR','HR_MANAGER','REGISTRAR','SUPER_ADMIN')
  @ApiQuery({ name: 'year', required: false, type: Number })
  async getRuns(@Query('year', new ParseIntPipe({ optional: true })) year?: number) {
    return { success: true, data: await this.svc.findAll(year) };
  }

  @Post('runs/:id/action')
  @Roles('BURSAR','HR_MANAGER','SUPER_ADMIN')
  @ApiOperation({ summary: 'FSM: COMPUTE → APPROVE → DISBURSE' })
  async applyAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayrollActionDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.applyAction(id, dto, u.sub) };
  }

  @Get('runs/:id/payslips')
  @Roles('BURSAR','HR_MANAGER','SUPER_ADMIN')
  async getPayslips(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.getPayslipsForRun(id) };
  }

  @Get('staff/:staffId/payslips')
  @Roles('STAFF','HR_MANAGER','BURSAR','SUPER_ADMIN')
  @ApiQuery({ name: 'year', required: false, type: Number })
  async getStaffPayslips(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @CurrentUser() u: JwtPayload,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    const effectiveRoles = u.roles?.length ? u.roles : [u.role];
    const isStaffSelfService = effectiveRoles.includes('STAFF')
      && !effectiveRoles.some((role) => ['BURSAR', 'HR_MANAGER', 'SUPER_ADMIN', 'REGISTRAR'].includes(role));
    const data = isStaffSelfService
      ? await this.svc.getOwnPayslips(u.sub, year)
      : await this.svc.getStaffPayslips(staffId, year);
    return { success: true, data };
  }

  // ── Export endpoints ───────────────────────────────────────────────────────
  @Get('runs/:id/export/ippis')
  @Roles('BURSAR','HR_MANAGER','SUPER_ADMIN')
  @ApiOperation({ summary: '[BURSAR] Download IPPIS CSV for federal payroll submission (S3)' })
  @ApiResponse({ status: 200, description: 'text/csv', content: { 'text/csv': {} } })
  async exportIppis(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: JwtPayload,
    @Res() res: Response,
  ) {
    const csv = await this.svc.generateIppisCsv(id, u.sub);
    const run  = await this.svc.findAll().then((r) => r.find((x) => x.id === id));
    const filename = `ippis-${run?.label ?? id}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // UTF-8 BOM for Excel compatibility
  }

  @Get('runs/:id/export/pencom')
  @Roles('BURSAR','HR_MANAGER','SUPER_ADMIN')
  @ApiOperation({ summary: '[BURSAR] Download PenCom Schedule 3 CSV for pension remittance (S4)' })
  async exportPencom(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: JwtPayload,
    @Res() res: Response,
  ) {
    const csv = await this.svc.generatePencomCsv(id, u.sub);
    const run  = await this.svc.findAll().then((r) => r.find((x) => x.id === id));
    const filename = `pencom-${run?.label ?? id}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  }
}
