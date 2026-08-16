import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit/audit.service";
import { UniversityPoliciesController } from "./university-policies.controller";
import { UniversityPoliciesService } from "./university-policies.service";

@Module({
  controllers: [UniversityPoliciesController],
  providers: [UniversityPoliciesService, AuditService],
  exports: [UniversityPoliciesService],
})
export class UniversityPoliciesModule {}
