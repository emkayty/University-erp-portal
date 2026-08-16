import { Global, Module } from '@nestjs/common';
import { RlsContextService } from './rls-context.service';

/**
 * Global so any feature module (PrivacyService today, more as the R2
 * rollout continues — see docs/CHANGELOG.md) can inject
 * RlsContextService without needing to import this module explicitly,
 * mirroring how DatabaseModule makes PrismaService globally available.
 */
@Global()
@Module({
  providers: [RlsContextService],
  exports: [RlsContextService],
})
export class RlsModule {}
