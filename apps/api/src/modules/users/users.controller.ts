import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

import type { JwtPayload } from '@uniportal/types';

import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateDelegationDto, CreateUserDto, GrantRoleDto, SetActiveDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller({ path: 'users', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
@Roles('SUPER_ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: '[SUPER_ADMIN] Create a new user account' })
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: JwtPayload) {
    const user = await this.usersService.createUser({
      ...dto,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
      grantedBy: actor.sub,
    });
    return { success: true, data: user };
  }

  @Get()
  @ApiOperation({ summary: '[SUPER_ADMIN] List all users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'role', required: false, enum: RoleName })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 50,
    @Query('role') role?: RoleName,
    @Query('isActive') isActive?: string,
  ) {
    const result = await this.usersService.findAll({
      roleFilter: role,
      isActive:   isActive !== undefined ? isActive === 'true' : undefined,
      page,
      pageSize:   Math.min(pageSize, 200),
    });
    return { success: true, data: result.users, meta: { total: result.total, page, pageSize, totalPages: result.totalPages } };
  }

  @Get('access-review')
  @ApiOperation({ summary: '[SUPER_ADMIN] Review expiring roles, revoked roles with active sessions, and expiring delegations' })
  @ApiQuery({ name: 'windowDays', required: false, type: Number, description: 'Expiry window in days; defaults to 30 and is capped at 90' })
  async accessReview(@Query('windowDays', new ParseIntPipe({ optional: true })) windowDays = 30) {
    const review = await this.usersService.getAccessReview(windowDays);
    return { success: true, data: review };
  }

  @Get(':id')
  @ApiOperation({ summary: '[SUPER_ADMIN] Get user by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findById(id);
    return { success: true, data: user };
  }

  @Post(':id/roles')
  @ApiOperation({ summary: '[SUPER_ADMIN] Grant a role to a user' })
  async grantRole(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: GrantRoleDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.usersService.grantRole({
      userId,
      roleName: dto.roleName,
      staffScope: dto.staffScope as never,
      actorId: actor.sub,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
      grantReason: dto.grantReason,
    });
    return { success: true, data: { message: 'Role granted' } };
  }

  @Post(':id/delegations')
  @Roles('SUPER_ADMIN', 'VC', 'REGISTRAR', 'DEAN', 'HOD', 'BURSAR', 'HR_MANAGER')
  @ApiOperation({ summary: 'Create a time-bounded delegation from the current user to another user' })
  async createDelegation(
    @Param('id', ParseUUIDPipe) delegateeId: string,
    @Body() dto: CreateDelegationDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    const delegation = await this.usersService.createDelegation({
      delegatorId: actor.sub,
      delegateeId,
      roleName: dto.roleName,
      staffScope: dto.staffScope,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      reason: dto.reason,
      approvedBy: actor.sub,
    });
    return { success: true, data: delegation };
  }

  @Delete(':id/delegations/:delegationId')
  @Roles('SUPER_ADMIN', 'VC', 'REGISTRAR', 'DEAN', 'HOD', 'BURSAR', 'HR_MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a time-bounded role delegation' })
  async revokeDelegation(
    @Param('delegationId', ParseUUIDPipe) delegationId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    const delegation = await this.usersService.revokeDelegation(delegationId, actor.sub);
    return { success: true, data: delegation };
  }

  @Delete(':id/roles/:roleName')
  @ApiOperation({ summary: '[SUPER_ADMIN] Revoke a role from a user' })
  @HttpCode(HttpStatus.OK)
  async revokeRole(
    @Param('id', ParseUUIDPipe) userId: string,
    @Param('roleName', new ParseEnumPipe(RoleName)) roleName: RoleName,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.usersService.revokeRole(userId, roleName, actor.sub);
    return { success: true, data: { message: 'Role revoked' } };
  }

  @Patch(':id/active')
  @ApiOperation({ summary: '[SUPER_ADMIN] Activate or deactivate a user account' })
  async setActive(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.usersService.setActive(userId, dto.isActive, actor.sub);
    return { success: true, data: { message: `Account ${dto.isActive ? 'activated' : 'deactivated'}` } };
  }
}
