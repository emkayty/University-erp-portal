import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../../common/queue-names';
import { isWorkerProcess } from '../../common/runtime/process-role';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsController } from './notifications.controller';
import { EnterpriseInfrastructureService } from '../../enterprise-infrastructure/enterprise-infrastructure.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS })],
  controllers: [NotificationsController],
  providers: [
    EnterpriseInfrastructureService,
    ...(isWorkerProcess() ? [NotificationsProcessor] : []),
  ],
})
export class NotificationsModule {}
