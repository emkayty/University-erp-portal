import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';

import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BlockClearanceItemDto, CreateClearanceItemDto, WaiveClearanceItemDto } from './dto/clearance.dto';
import { ClearanceService } from './clearance.service';

@ApiTags('clearance')
@Controller({ path: 'clearance', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class ClearanceController {
  constructor(private readonly svc: ClearanceService) {}

  @Get('items')
  @Roles('SUPER_ADMIN', 'REGISTRAR')
  async listItems() {
    return { success: true, data: await this.svc.listItems() };
  }

  @Post('items')
  @Roles('SUPER_ADMIN')
  async createItem(@Body() dto: CreateClearanceItemDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createItem(dto, u.sub) };
  }

  @Get('student/:studentId')
  @Roles('STUDENT', 'REGISTRAR', 'SUPER_ADMIN', 'STAFF', 'HOD', 'DEAN', 'BURSAR', 'VC')
  @ApiOperation({ summary: "Full graduation-eligibility checklist for a student" })
  async getStudentClearance(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.getStudentClearance(studentId, u.sub, u.role) };
  }

  @Patch('student/:studentId/item/:itemId/clear')
  @Roles('STAFF', 'HOD', 'DEAN', 'BURSAR', 'REGISTRAR', 'SUPER_ADMIN')
  async clearItem(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.clearItem(studentId, itemId, u.sub, u.role) };
  }

  @Patch('student/:studentId/item/:itemId/block')
  @Roles('STAFF', 'HOD', 'DEAN', 'BURSAR', 'REGISTRAR', 'SUPER_ADMIN')
  async blockItem(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: BlockClearanceItemDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.blockItem(studentId, itemId, dto, u.sub, u.role) };
  }

  @Patch('student/:studentId/item/:itemId/waive')
  @Roles('VC', 'SUPER_ADMIN')
  async waiveItem(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: WaiveClearanceItemDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.waiveItem(studentId, itemId, dto, u.sub, u.role) };
  }

  @Get('pending')
  @Roles('REGISTRAR', 'SUPER_ADMIN', 'STAFF', 'HOD', 'DEAN', 'BURSAR')
  async listPending(@Query('clearanceItemId') clearanceItemId?: string) {
    return { success: true, data: await this.svc.listPending(clearanceItemId) };
  }
}
