import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports:     [OutboxModule],
  controllers: [CalendarController],
  providers:   [CalendarService, AuditService],
  exports:     [CalendarService],
})
export class CalendarModule {}
