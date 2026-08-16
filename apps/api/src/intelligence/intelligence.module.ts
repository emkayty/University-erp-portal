import { Module } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceController } from './intelligence.controller';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [IntelligenceController],
  providers: [IntelligenceService, PrismaService],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
