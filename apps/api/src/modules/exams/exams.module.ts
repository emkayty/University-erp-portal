import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AcademicOfferingAuthorizationService } from '../../common/authorization/academic-offering-authorization.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  controllers: [ExamsController],
  providers:   [ExamsService, AuditService, AcademicOfferingAuthorizationService],
  exports:     [ExamsService],
})
export class ExamsModule {}
