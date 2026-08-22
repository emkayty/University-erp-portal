import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IdentityCardHolderType, IdentityCardStatus } from '@prisma/client';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { IdentityCardLifecycleDto, IssueIdentityCardDto } from './dto/identity-card.dto';
import { BulkIdentityCardPdfDto } from './dto/identity-card-pdf.dto';
import { IdentityCardsService } from './identity-cards.service';

@ApiTags('Identity Cards')
@Controller({ path: 'identity-cards', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class IdentityCardsController {
  constructor(private readonly service: IdentityCardsService) {}

  @Get('me')
  @Roles('STUDENT', 'STAFF', 'VC', 'HR_MANAGER', 'REGISTRAR', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'View the current user identity card' })
  async me(@CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.getMine(user.sub) };
  }

  @Public()
  @Get('verify/:token')
  @ApiOperation({ summary: 'Publicly verify an opaque identity-card QR token' })
  async verify(@Param('token') token: string) {
    return { success: true, data: await this.service.verify(token) };
  }

  @Get()
  @Roles('SUPER_ADMIN', 'REGISTRAR', 'HR_MANAGER')
  @ApiQuery({ name: 'holderType', required: false, enum: IdentityCardHolderType })
  @ApiQuery({ name: 'status', required: false, enum: IdentityCardStatus })
  @ApiQuery({ name: 'search', required: false })
  async list(
    @Query('holderType') holderType?: IdentityCardHolderType,
    @Query('status') status?: IdentityCardStatus,
    @Query('search') search?: string,
  ) {
    return { success: true, data: await this.service.list({ holderType, status, search }) };
  }

  @Post('bulk-pdf')
  @Roles('SUPER_ADMIN', 'REGISTRAR', 'HR_MANAGER')
  @ApiOperation({ summary: 'Generate a controlled A4 10-up duplex PDF for selected active identity cards' })
  async bulkPdf(@Body() dto: BulkIdentityCardPdfDto, @CurrentUser() user: JwtPayload, @Res() res: import('express').Response) {
    const result = await this.service.bulkPdf(dto, user.sub);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    return res.send(result.buffer);
  }

  @Post('issue')
  @Roles('SUPER_ADMIN', 'REGISTRAR', 'HR_MANAGER')
  @ApiOperation({ summary: 'Issue or replace a student/staff identity card' })
  async issue(@Body() dto: IssueIdentityCardDto, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.issue(dto, user.sub, user.roles ?? [user.role]) };
  }

  @Patch(':id/suspend')
  @Roles('SUPER_ADMIN', 'REGISTRAR', 'HR_MANAGER')
  async suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: IdentityCardLifecycleDto, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.changeStatus(id, IdentityCardStatus.SUSPENDED, dto, user.sub) };
  }

  @Patch(':id/revoke')
  @Roles('SUPER_ADMIN', 'REGISTRAR', 'HR_MANAGER')
  async revoke(@Param('id', ParseUUIDPipe) id: string, @Body() dto: IdentityCardLifecycleDto, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.changeStatus(id, IdentityCardStatus.REVOKED, dto, user.sub) };
  }
}
