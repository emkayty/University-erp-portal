import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { AdmissionsModule } from '../admissions/admissions.module';
import { AlumniModule } from '../alumni/alumni.module';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { MatricNumberService } from './matric-number.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [AuthModule, AdmissionsModule, CalendarModule, OutboxModule, AlumniModule],
  controllers: [StudentsController],
  providers:   [StudentsService, MatricNumberService, AuditService],
  exports:     [StudentsService],
})
export class StudentsModule {}
