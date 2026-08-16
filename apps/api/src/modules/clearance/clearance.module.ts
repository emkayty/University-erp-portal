import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ClearanceController } from './clearance.controller';
import { ClearanceService } from './clearance.service';

@Module({
  controllers: [ClearanceController],
  providers:   [ClearanceService, AuditService],
  exports:     [ClearanceService],
})
export class ClearanceModule {}
