import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ClinicController } from './clinic.controller';
import { ClinicService } from './clinic.service';

/**
 * ClinicModule — Module 10: Health Clinic Management
 *
 * Feature flag: module_health (must be TRUE to access any endpoint)
 * Security: Medical records (diagnosis, treatment, prescriptions) are
 *           AES-256-GCM encrypted at service layer using encryptPii/decryptPii.
 * RLS: Enforced at controller layer (JwtPayload.sub checks) and service layer.
 */
@Module({
  controllers: [ClinicController],
  providers:   [ClinicService, AuditService],
  exports:     [ClinicService],
})
export class ClinicModule {}
