import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PrivateObjectStorageService } from '../../common/storage/private-object-storage.service';
import { AcademicOfferingAuthorizationService } from '../../common/authorization/academic-offering-authorization.service';
import { LmsController } from './lms.controller';
import { LmsService } from './lms.service';

@Module({
  controllers: [LmsController],
  providers:   [LmsService, AuditService, PrivateObjectStorageService, AcademicOfferingAuthorizationService],
  exports:     [LmsService],
})
export class LmsModule {}
