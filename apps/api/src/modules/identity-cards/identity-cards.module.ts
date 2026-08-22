import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PrivateObjectStorageService } from '../../common/storage/private-object-storage.service';
import { SettingsModule } from '../settings/settings.module';
import { IdentityCardPdfService } from './identity-card-pdf.service';
import { IdentityCardsController } from './identity-cards.controller';
import { IdentityCardsService } from './identity-cards.service';

@Module({
  imports: [SettingsModule],
  controllers: [IdentityCardsController],
  providers: [IdentityCardsService, IdentityCardPdfService, PrivateObjectStorageService, AuditService],
  exports: [IdentityCardsService],
})
export class IdentityCardsModule {}
