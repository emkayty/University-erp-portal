import {
  Body, Controller, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BorrowItemDto, CreateLibraryItemDto, SearchLibraryDto } from './dto/library.dto';
import { LibraryService } from './library.service';

@ApiTags('Library')
@Controller({ path: 'library', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class LibraryController {
  constructor(private readonly svc: LibraryService) {}

  @Post('items')
  @Roles('STAFF','HOD','REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: 'Add a new library item (librarian role via STAFF)' })
  async createItem(@Body() dto: CreateLibraryItemDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.createItem(dto, u.sub) };
  }

  @Get('items')
  @Roles('STUDENT','STAFF','HOD','REGISTRAR','SUPER_ADMIN')
  async search(@Query() dto: SearchLibraryDto) {
    return { success: true, data: await this.svc.search(dto) };
  }

  @Get('items/:id')
  @Roles('STUDENT','STAFF','HOD','REGISTRAR','SUPER_ADMIN')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.findById(id) };
  }

  @Post('loans')
  @Roles('STUDENT','STAFF','HOD','REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: 'Borrow a library item (student or staff)' })
  async borrow(@Body() dto: BorrowItemDto, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.borrowItem(dto, u.sub) };
  }

  @Patch('loans/:id/return')
  @Roles('STUDENT','STAFF','HOD','REGISTRAR','SUPER_ADMIN')
  async returnItem(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.returnItem(id, u.sub) };
  }

  @Patch('loans/:id/renew')
  @Roles('STUDENT','STAFF','HOD','SUPER_ADMIN')
  async renewLoan(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.renewLoan(id, u.sub) };
  }

  @Get('loans/my')
  @Roles('STUDENT','STAFF','HOD','REGISTRAR','SUPER_ADMIN')
  async getMyLoans(@CurrentUser() u: JwtPayload) {
    return { success: true, data: await this.svc.getUserLoans(u.sub) };
  }

  @Get('loans/overdue')
  @Roles('STAFF','HOD','REGISTRAR','SUPER_ADMIN')
  @ApiOperation({ summary: '[LIBRARIAN] List and mark overdue loans' })
  async getOverdue() {
    return { success: true, data: await this.svc.getOverdueLoans() };
  }
}
