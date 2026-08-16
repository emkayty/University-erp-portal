import {
  Body, Controller, Delete, Get, Param,
  ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CalendarService } from './calendar.service';
import { CreateCalendarDto, CreateCalendarEventDto, SuspendCalendarDto } from './dto/calendar.dto';

@ApiTags('Calendar')
@Controller({ path: 'calendar', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class CalendarController {
  constructor(private readonly svc: CalendarService) {}

  @Get()
  @Roles('SUPER_ADMIN','VC','REGISTRAR','DEAN','HOD','BURSAR','HR_MANAGER')
  @ApiOperation({ summary: 'List all academic calendars' })
  async findAll() {
    return { success: true, data: await this.svc.findAll() };
  }

  @Get('active')
  @Public()
  @ApiOperation({ summary: 'Get the currently active calendar (public)' })
  async getActive() {
    return { success: true, data: await this.svc.getActive() };
  }

  @Get(':id')
  @Roles('SUPER_ADMIN','VC','REGISTRAR')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.findById(id) };
  }

  @Post()
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Create a new academic calendar (DRAFT)' })
  async create(@Body() dto: CreateCalendarDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.create(dto, u.sub) };
  }

  @Patch(':id/activate')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Activate a DRAFT calendar' })
  async activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.activate(id, u.sub) };
  }

  @Patch(':id/suspend')
  @Roles('REGISTRAR','VC','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR|VC] Suspend active calendar (ASUU strike mode)' })
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendCalendarDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.suspend(id, dto, u.sub) };
  }

  @Patch(':id/resume')
  @Roles('REGISTRAR','VC','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR|VC] Resume a SUSPENDED calendar' })
  async resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.resume(id, u.sub) };
  }

  @Patch(':id/complete')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[REGISTRAR] Mark calendar COMPLETED (end of year)' })
  async complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.complete(id, u.sub) };
  }

  @Post(':id/events')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: 'Add a calendar event (registration window, exam, holiday...)' })
  async addEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCalendarEventDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return { success: true, data: await this.svc.addEvent(id, dto, u.sub) };
  }

  @Delete(':id/events/:eventId')
  @Roles('REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: 'Remove a calendar event' })
  async removeEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    await this.svc.removeEvent(id, eventId, u.sub);
    return { success: true, data: { message: 'Event removed' } };
  }
}
