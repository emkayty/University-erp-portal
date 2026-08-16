import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { isWorkerProcess } from '../../common/runtime/process-role';
import { HrController } from './hr.controller';
import { HrLeaveRestorationScheduler } from './hr-leave-restoration.scheduler';
import { HrService } from './hr.service';

@Module({
  controllers: [HrController],
  providers: [
    HrService,
    AuditService,
    ...(isWorkerProcess() ? [HrLeaveRestorationScheduler] : []),
  ],
  exports:     [HrService],
})
export class HrModule {}
