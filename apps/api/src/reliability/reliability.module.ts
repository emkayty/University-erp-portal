import { Module } from '@nestjs/common';
import { ReliabilityController } from './reliability.controller';
import { ReliabilityService } from './reliability.service';
import { AuditService } from '../common/audit/audit.service';
import { OutboxModule } from '../common/outbox/outbox.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule, OutboxModule],
  controllers: [ReliabilityController],
  providers: [ReliabilityService, AuditService],
})
export class ReliabilityModule {}
