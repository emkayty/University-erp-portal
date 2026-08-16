import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers:   [SettingsService, AuditService],
  exports:     [SettingsService],
})
export class SettingsModule {}
