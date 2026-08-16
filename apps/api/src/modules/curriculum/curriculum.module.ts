import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';

@Module({
  controllers: [CurriculumController],
  providers:   [CurriculumService, AuditService],
  exports:     [CurriculumService],
})
export class CurriculumModule {}
