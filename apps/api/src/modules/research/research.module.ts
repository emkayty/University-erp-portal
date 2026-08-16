import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

/** ResearchModule — Module 12: Research & Grants. Feature flag: module_research */
@Module({
  controllers: [ResearchController],
  providers:   [ResearchService, AuditService],
  exports:     [ResearchService],
})
export class ResearchModule {}
