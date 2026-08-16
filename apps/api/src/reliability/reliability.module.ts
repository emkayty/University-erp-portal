import { Module } from '@nestjs/common';
import { ReliabilityController } from './reliability.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ReliabilityController],
})
export class ReliabilityModule {}
