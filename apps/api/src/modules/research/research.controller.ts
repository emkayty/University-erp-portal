import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, FeatureFlag, Roles, StaffScopes } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '@uniportal/types';
import { ResearchService } from './research.service';
import type {
  AddResearchMemberDto, CreateGrantDto, CreateResearchOutputDto,
  CreateResearchProjectDto, GetProjectsQueryDto, RecordExpenditureDto,
  UpdateProjectStatusDto, UpdateResearchProjectDto,
} from './dto/research.dto';

@FeatureFlag('module_research')
@UseGuards(RolesGuard)
@Controller({ path: 'research', version: '1' })
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('research')
  @Post('projects')
  createProject(@Body() dto: CreateResearchProjectDto, @CurrentUser() user: JwtPayload) {
    return this.research.createProject(dto, user.sub);
  }

  @Roles('STAFF', 'VC', 'REGISTRAR', 'SUPER_ADMIN')
  @Get('projects')
  getProjects(@Query() query: GetProjectsQueryDto) {
    return this.research.getProjects(query);
  }

  @Roles('STAFF', 'VC', 'REGISTRAR', 'SUPER_ADMIN')
  @Get('projects/:id')
  getProject(@Param('id', ParseUUIDPipe) id: string) {
    return this.research.getProjectById(id);
  }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('research')
  @Patch('projects/:id')
  updateProject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateResearchProjectDto, @CurrentUser() user: JwtPayload) {
    return this.research.updateProject(id, dto, user.sub);
  }

  /** Ethics clearance gate — REGISTRAR or VC only */
  @Roles('REGISTRAR', 'VC', 'SUPER_ADMIN')
  @Patch('projects/:id/status')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectStatusDto, @CurrentUser() user: JwtPayload) {
    return this.research.updateProjectStatus(id, dto, user.sub);
  }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('research')
  @Post('projects/:id/members')
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddResearchMemberDto, @CurrentUser() user: JwtPayload) {
    return this.research.addMember(id, dto, user.sub);
  }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('research')
  @Delete('projects/:id/members/:userId')
  removeMember(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: JwtPayload) {
    return this.research.removeMember(id, userId, user.sub);
  }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('research')
  @Post('projects/:id/grants')
  addGrant(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateGrantDto, @CurrentUser() user: JwtPayload) {
    return this.research.addGrant(id, dto, user.sub);
  }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('research')
  @Post('grants/:id/expenditures')
  recordExpenditure(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordExpenditureDto, @CurrentUser() user: JwtPayload) {
    return this.research.recordExpenditure(id, dto, user.sub);
  }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('research')
  @Post('projects/:id/outputs')
  addOutput(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateResearchOutputDto, @CurrentUser() user: JwtPayload) {
    return this.research.addOutput(id, dto, user.sub);
  }

  @Roles('VC', 'REGISTRAR', 'SUPER_ADMIN')
  @Get('reports/summary')
  getSummary() {
    return this.research.getSummaryReport();
  }
}
