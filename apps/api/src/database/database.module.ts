import { Global, Module } from '@nestjs/common';
import { DirectPrismaService } from './direct-prisma.service';
import { PartitionManagerService } from './partition-manager.service';
import { PrismaService } from './prisma.service';
import { isWorkerProcess } from '../common/runtime/process-role';

@Global()
@Module({
  providers: [
    PrismaService,
    DirectPrismaService,
    ...(isWorkerProcess() ? [PartitionManagerService] : []),
  ],
  exports:   [PrismaService, DirectPrismaService],
})
export class DatabaseModule {}
