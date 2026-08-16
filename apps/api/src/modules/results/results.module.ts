import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  imports:     [OutboxModule],
  controllers: [ResultsController],
  providers:   [ResultsService, AuditService],
  exports:     [ResultsService],
})
export class ResultsModule {}
