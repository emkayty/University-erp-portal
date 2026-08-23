import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AllocateRoomDto, CreateBlockDto, CreateRoomDto } from './dto/hostel.dto';
import { HostelService } from './hostel.service';

@ApiTags('Hostel')
@Controller({ path: 'hostel', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class HostelController {
  constructor(private readonly svc: HostelService) {}

  @Post('blocks') @Roles('REGISTRAR','SUPER_ADMIN') async createBlock(@Body() dto: CreateBlockDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.createBlock(dto, u.sub) }; }
  @Get('blocks') @Roles('STUDENT','STAFF','REGISTRAR','SUPER_ADMIN') async getBlocks() { return { success: true, data: await this.svc.getAllBlocks() }; }
  @Post('rooms') @Roles('REGISTRAR','SUPER_ADMIN') async createRoom(@Body() dto: CreateRoomDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.createRoom(dto, u.sub) }; }
  @Get('blocks/:id/rooms') @Roles('STUDENT','STAFF','REGISTRAR','SUPER_ADMIN') async getRooms(@Param('id', ParseUUIDPipe) id: string) { return { success: true, data: await this.svc.getRoomsInBlock(id) }; }
  @Get('allocations') @Roles('REGISTRAR','SUPER_ADMIN') async getAllocations(@Query('academicYear') academicYear?: string) { return { success: true, data: await this.svc.getActiveAllocations(academicYear) }; }
  @Post('allocations') @Roles('REGISTRAR','SUPER_ADMIN') @ApiOperation({ summary: '[REGISTRAR] Allocate a room to a student' }) async allocate(@Body() dto: AllocateRoomDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.allocateRoom(dto, u.sub) }; }
  @Patch('allocations/:id/vacate') @Roles('REGISTRAR','SUPER_ADMIN') async vacate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.vacateRoom(id, u.sub) }; }
  @Get('my-allocation') @Roles('STUDENT','SUPER_ADMIN') async myAllocation(@CurrentUser() u: JwtPayload, @Query('academicYear') year: string) { return { success: true, data: await this.svc.getMyAllocation(u.sub, year) }; }
}
