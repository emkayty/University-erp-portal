import { Module } from '@nestjs/common';
import { EnterpriseInfrastructureService } from './enterprise-infrastructure.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  providers: [EnterpriseInfrastructureService, PrismaService],
  exports: [EnterpriseInfrastructureService],
})
export class EnterpriseInfrastructureModule {}
