import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  controllers: [PayrollController],
  providers:   [PayrollService, AuditService],
  exports:     [PayrollService],
})
export class PayrollModule {}
