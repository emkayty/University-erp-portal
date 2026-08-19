import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser } from '../common/decorators';
import type { JwtPayload } from '@uniportal/types';
import { IntelligenceService } from './intelligence.service';
import { AssignTaskDto, UpdateTaskStatusDto } from './intelligence.dto';

@ApiTags('Intelligence')
@Controller({ path: 'intelligence', version: '1' })
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN', 'VC', 'REGISTRAR', 'STAFF')
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Get('alerts')
  @ApiOperation({ summary: 'List enterprise alerts visible to the current staff member' })
  async alerts(@Query('status') status?: string, @Query('domain') domain?: string, @CurrentUser() user?: JwtPayload) {
    return this.intelligence.listAlerts({ status, domain, actorId: user?.sub, roles: user?.roles ?? (user?.role ? [user.role] : undefined) });
  }

  @Get('alerts/:id')
  @ApiOperation({ summary: 'Get an enterprise alert' })
  async alert(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: JwtPayload) {
    return this.intelligence.getAlert(id, user?.sub, user?.roles ?? (user?.role ? [user.role] : undefined));
  }

  @Patch('alerts/:id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an enterprise alert' })
  async acknowledge(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.intelligence.acknowledgeAlert(id, user.sub);
  }

  @Patch('alerts/:id/resolve')
  @ApiOperation({ summary: 'Resolve an enterprise alert' })
  async resolve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.intelligence.resolveAlert(id, user.sub, user.roles ?? [user.role]);
  }

  @Patch('alerts/:id/dismiss')
  @ApiOperation({ summary: 'Dismiss an enterprise alert' })
  async dismiss(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.intelligence.dismissAlert(id, user.sub, user.roles ?? [user.role]);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List human-review automation tasks' })
  async tasks(@Query('status') status?: string, @Query('domain') domain?: string, @CurrentUser() user?: JwtPayload) {
    return this.intelligence.listTasks({ status, domain, actorId: user?.sub, roles: user?.roles ?? (user?.role ? [user.role] : undefined) });
  }

  @Post('tasks/:id/claim')
  @Roles('SUPER_ADMIN', 'VC', 'REGISTRAR', 'STAFF')
  @ApiOperation({ summary: 'Claim an unassigned automation task' })
  async claimTask(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.intelligence.claimTask(id, user.sub);
  }

  @Patch('tasks/:id/assign')
  @Roles('SUPER_ADMIN', 'VC', 'REGISTRAR')
  @ApiOperation({ summary: 'Assign an automation task to an active user' })
  async assignTask(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignTaskDto, @CurrentUser() user: JwtPayload) {
    return this.intelligence.assignTask(id, dto.assigneeId, user.sub, user.roles ?? [user.role]);
  }

  @Patch('tasks/:id/status')
  @Roles('SUPER_ADMIN', 'VC', 'REGISTRAR', 'STAFF')
  @ApiOperation({ summary: 'Advance or reopen an automation task' })
  async updateTaskStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskStatusDto, @CurrentUser() user: JwtPayload) {
    return this.intelligence.updateTaskStatus(id, dto.status, user.sub, user.roles ?? [user.role], dto.note);
  }
}
