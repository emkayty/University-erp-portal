import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AlumniController } from './alumni.controller';
import { AlumniService } from './alumni.service';

/** AlumniModule — Module 13: Alumni & Endowment Portal. Feature flag: module_alumni */
@Module({
  controllers: [AlumniController],
  providers:   [AlumniService, AuditService],
  exports:     [AlumniService],
})
export class AlumniModule {}
