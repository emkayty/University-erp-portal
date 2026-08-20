import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { IdentityCardsController } from './identity-cards.controller';
import { IdentityCardsService } from './identity-cards.service';

@Module({
  controllers: [IdentityCardsController],
  providers: [IdentityCardsService, AuditService],
  exports: [IdentityCardsService],
})
export class IdentityCardsModule {}
