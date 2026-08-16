import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';

@Module({
  controllers: [TransportController],
  providers:   [TransportService, AuditService],
  exports:     [TransportService],
})
export class TransportModule {}
