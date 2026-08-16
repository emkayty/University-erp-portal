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
import { CreateUserDto, GrantRoleDto, RevokeRoleDto, SetActiveDto } from './dto/users.dto';
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
    const user = await this.usersService.createUser({ ...dto, grantedBy: actor.sub });
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
    await this.usersService.grantRole({ userId, roleName: dto.roleName, staffScope: dto.staffScope as never, actorId: actor.sub });
    return { success: true, data: { message: 'Role granted' } };
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
