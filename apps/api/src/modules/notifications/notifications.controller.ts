import { Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';

import { CurrentUser, SelfScoped } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EnterpriseInfrastructureService } from '../../enterprise-infrastructure/enterprise-infrastructure.service';

@ApiTags('Enterprise notifications')
@Controller({ path: 'enterprise/notifications', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class NotificationsController {
  constructor(private readonly service: EnterpriseInfrastructureService) {}

  @SelfScoped()
  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.listNotifications(user.sub) };
  }

  @SelfScoped()
  @Patch(':id/read')
  async markRead(
    @Param('id', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.markNotificationRead(user.sub, notificationId) };
  }
}
