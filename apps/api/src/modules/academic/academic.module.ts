import { Module } from '@nestjs/common';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';
import { AuditService } from '../../common/audit/audit.service';
import { AcademicProgressionProcessor } from './jobs/academic-progression.processor';
import { isWorkerProcess } from '../../common/runtime/process-role';

@Module({
  controllers: [AcademicController],
  providers: [
    AcademicService,
    AuditService,
    ...(isWorkerProcess() ? [AcademicProgressionProcessor] : []),
  ],
  exports: [AcademicService],
})
export class AcademicModule {}
