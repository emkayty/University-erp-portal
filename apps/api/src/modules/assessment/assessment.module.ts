import { Module } from '@nestjs/common';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AuditService } from '../../common/audit/audit.service';
import { AcademicOfferingAuthorizationService } from '../../common/authorization/academic-offering-authorization.service';

@Module({ controllers: [AssessmentController], providers: [AssessmentService, AuditService, AcademicOfferingAuthorizationService], exports: [AssessmentService] })
export class AssessmentModule {}
