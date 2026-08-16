import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { HostelController } from './hostel.controller';
import { HostelService } from './hostel.service';

@Module({
  controllers: [HostelController],
  providers:   [HostelService, AuditService],
  exports:     [HostelService],
})
export class HostelModule {}
